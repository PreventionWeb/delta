# Design: ca-he-error-boundary (roadmap 6b)

## UI governance and traceability metadata

```yaml
design-system:
  repository: https://github.com/unisdr/delta-design
  version-or-tag: v0.7.2
  commit: a86cc3a62378871e93cbfa14aa69740201b8c556

feature-prototype:
  repository: https://github.com/unisdr/delta-feature-prototypes
  path: not-applicable
  commit: e24b8ad4dee319d5efa2a7c57fca30948f130bd0
  status: not-required
  exception-reason: "Explicitly approved human review exception (user, 2026-11-23, OD-1/OD-6): Hazardous Events retains legacy styling by agreement until the HE UI upgrade to the new design system iteration; no prototype in delta-feature-prototypes@e24b8ad covers HE or an error state, so legacy HE is the parity reference"

ui-classification: legacy-exempt
```

How these values were obtained (no value invented):

- `design-system` `v0.7.2` / `a86cc3a…`: the version written in the synced
  `_docs/design/DESIGN.md` ("draft v0.7.2") and `_docs/design/tokens.css` line 1, and the pair
  recorded by the archived `2026-11-23-access-management-redesign` design.md and Gate 9 report.
  `git ls-remote https://github.com/unisdr/delta-design` (2026-11-23) shows `a86cc3a…` as the
  current `main` head and **no tag refs at all**, so `v0.7.2` is the tokens.json version, not a
  git tag. The commit SHA is the immutable reference. Accepted by the user 2026-11-23 (OD-9).
- `feature-prototype`: the repository tree at `e24b8ad` (current `main`, 2026-11-23) contains
  `features/{access-management, api-keys, assets, disaster-events, emails, event-management,
geographic-levels, login, organization-management, profile, sectors, system-settings}`.
  None covers Hazardous Events or an error/not-found state (`event-management` is a generic
  "upcoming events and registrations" concept; grep for not found/404/error/forbidden/trace in
  its files returns nothing). The skill permits `not-required` only for an "explicitly approved
  human review exception"; the user approved it on 2026-11-23 (OD-6).

## Context

See proposal.md (Why). Current code and live behaviour:

### Existing behaviour (observed live 2026-11-23, dev server, test admin, dev mode)

All live results are **dev mode** (`NODE_ENV=development`). The SQL text and `[object Object]`
come from the root boundary's `isDev` branch (`app/root.tsx:384-393`); in production React
Router sanitizes thrown `Error`s to a generic message and the root boundary shows "Something went
wrong. Please try again later." (code reading, not observed live).

| Case                                         | Legacy `/en/hazardous-event/...`                                                                                                                                                                       | CA `/en/he-preview/...` today                                                                                                                                                                                                                                                                                                                                  | Notices (`NoticeErrorBoundary`)                                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing id (valid UUID, no row)              | **500**, root boundary, "Unexpected Error / hazardous event not found" + stack (dev) — `app/backend.server/models/event.ts:1690` throws plain `Error` (live result wins over `form.ts:742`'s 404 path) | **404**, root boundary full page, title "404", body "[object Object]" (dev: `String(error.data)` of the envelope), no app header/nav, "Return to Home", support line. Same for `edit/<uuid>` and `new?parent=<uuid>`                                                                                                                                           | **404**, rendered inside the app layout: `<div role="alert"><p>Notice not found</p><button>{traceId}</button></div>` (`NoticeErrorBoundary.tsx:10-27`). English message under every locale; no heading, no back link |
| Malformed id (`not-a-uuid`)                  | **500**, root boundary, dev shows raw "Failed query: select …" (detail and edit)                                                                                                                       | **500**, root boundary, dev shows raw "Failed query: select …" on `$id`, `edit/$id`, `new?parent=`; `POST delete/not-a-uuid` → 500 "Unexpected Server Error" + SQL text. Cause: `findById` (`DrizzleHazardousEventRepository.server.ts:345-368`) has no driver-error mapping, `throwHazardousEventLoaderError.server.ts:25-26` logs and rethrows the raw error | **500**, generic "An unexpected error occurred. Please try again later." (`NoticeErrorBoundary.tsx:30-34`). Same gap as HE; reported, not fixed here                                                                 |
| Valid UUID, no row, delete action            | n/a (legacy delete is a form post)                                                                                                                                                                     | **404** JSON `{"ok":false,"messageKeys":["delete.not_found"]}` → toast (6l), correct                                                                                                                                                                                                                                                                           | n/a                                                                                                                                                                                                                  |
| Foreign-tenant id                            | **403** "Unauthorized access" (`hazardous-event+/$id.tsx:54-56`), **code only**                                                                                                                        | **404** (tenant-scoped `findById`, spec `hazardous-event-route-adapter` "unknown or cross-tenant id"), **code only**                                                                                                                                                                                                                                           | 404 by the same pattern, code only                                                                                                                                                                                   |
| Authorization failure (no ViewData/EditData) | `authLoaderWithPerm` (`hazardous-event+/edit.$id.tsx:47`) throws `new Response("Forbidden", { status: 403 })` (`app/utils/auth.ts:292`) → root boundary "403 Forbidden", **code only**                 | 403 envelope thrown by `requireViewDataPermission.server.ts:21-28` / `requireEditDataPermission` **before** `loadNamespaces` (`$id.tsx:21` vs `:23`), so a translating boundary would get no `hazardous-events` resources. **Code only**                                                                                                                       | 403 envelope, English message                                                                                                                                                                                        |
| Picker / list happy path                     | n/a                                                                                                                                                                                                    | 200 (no error reachable without code changes)                                                                                                                                                                                                                                                                                                                  | n/a                                                                                                                                                                                                                  |
| Thrown server error (non-Domain)             | 500 root boundary                                                                                                                                                                                      | Not reachable without code changes except via 22P02 above (same path)                                                                                                                                                                                                                                                                                          | generic fallback, no traceId                                                                                                                                                                                         |

Not observable live, recorded as "code only": a read-only query (2026-11-23) found all 42
`hazardous_event` rows in the test admin's only tenant (`50c88fb1…`), so no foreign-tenant row
exists without creating data; the test admin has every permission, so 403 is not reachable
without another account. No data was created or deleted. Screenshot of the CA 404 root boundary:
`C:\Users\ANGESH~1\AppData\Local\Temp\claude-chrome-screenshots-VAqefv\screenshot-1795448096081-5.jpg`
(scratch, not committed).

### Layer ownership (Clean Architecture / DDD, ADR-003, ADR-009)

| Layer                                                           | Owns                                                                                                                                                                                                                                       | In this change                                                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain (`app/shared/errors/DomainError.ts`)                     | Error vocabulary only (`NotFoundError`, `AuthorizationError`, …); no HTTP or UI knowledge (ADR-003 Layer 1). `statusHint` is a hint, not an HTTP dependency                                                                                | No change                                                                                                                                                                     |
| Application (use cases)                                         | Let domain errors propagate; never swallow (ADR-003 Layer 2)                                                                                                                                                                               | No change. `GetHazardousEventByIdUseCase`, `Create/UpdateHazardousEventUseCase` (cause lookups) receive `NotFoundError` instead of a raw pg error once infrastructure maps it |
| Infrastructure (`DrizzleHazardousEventRepository`)              | Map Drizzle/pg errors to domain errors before they cross the port; no pg concept leaks upward (ADR-003 Layer 3 + Rule 2; Clean Architecture dependency rule, "data formats used in an outer circle should not be used by an inner circle") | **22P02 on a read-by-id path becomes `NotFoundError`** (D2)                                                                                                                   |
| Presentation / web adapter (`presentation/web/`, route modules) | Map a `DomainError` to the ADR-003 envelope + HTTP status (`throwHazardousEventLoaderError`), render the route `ErrorBoundary`, localise copy (ADR-003 Layer 4, ADR-009 `presentation/web/`)                                               | New boundary + mapper (D1, D3), envelope for unexpected errors (D4), namespace loading order (D5)                                                                             |

## Goals / Non-Goals

**Goals:** one error experience for every UI-rendering he-preview route; malformed id is
not-found everywhere; no internal detail rendered; trace reference visible and copyable; EN/FR;
WCAG 2.2 AA; envelope `details` limited to field-level validation (D8).

**Non-Goals:** Notices' own malformed-id 500 and its untranslated message (report only); legacy
`/hazardous-event` routes (stay as is until Phase 7 cutover); the root boundary in
`app/root.tsx`; the REST filter's behaviour beyond D8's `details` rule; any change to
`app/design-system/ui/`, `AccessManagementPage` or the `design-system-components` requirements
(OD-1, PR #840 untouched); merging the two design-system folders (DEF-014, assigned team member);
re-skinning HE to v0.7.2 (later "HE UI upgrade" iteration); the pre-existing `#666` in
`HazardousEventListPage.tsx` (legacy-exempt, left as is); DEF-056;
route `meta`/document title (none of the he-preview
routes export `meta` today; pre-existing); DEF-053/6m, DEF-055, DEF-050/051, DEF-015.

## Decisions

### D1. A per-domain boundary component, thin, with a pure mapper (ADR-003 "React Router Error Boundaries", ADR-009)

`HazardousEventErrorBoundary` (React component, `presentation/web/`) calls `useRouteError()` and
delegates to a pure function `mapRouteErrorToView(error: unknown): HazardousEventErrorView`:

```ts
type HazardousEventErrorKind =
	| "not_found"
	| "forbidden"
	| "invalid_request"
	| "conflict"
	| "unexpected";
interface HazardousEventErrorView {
	kind: HazardousEventErrorKind; // drives title/body i18n keys
	traceId: string | null; // only a non-empty string from a parsed ErrorResponse
}
```

Narrowing order: `isRouteErrorResponse(error)` first (React Router docs, Error Boundaries), then
read `error.data` as `ErrorResponse` defensively (it may be a string or a foreign shape), map by
`error.status` (404 → not_found, 403 → forbidden, 400/422 → invalid_request, 409 → conflict,
anything else → unexpected); any non-Response value (an `Error`, a string, `undefined`) →
`unexpected` with `traceId: null`. The mapper never reads `error.message`, `error.stack`,
`data.error.message` or `data.error.details` (ADR-003 Rule 4, OWASP error-handling guidance).
Keyed off status, never message text, the same rule the 6l `mapDeleteErrorToMessageKeys` follows.

Why a separate mapper: it is the only real logic in the boundary, so it gets Red-Green TDD and
mutation testing; the component stays declarative. Alternative (all logic in the component, as in
Notices) rejected: harder to test exhaustively and mixes rendering with classification.

Export: `export { HazardousEventErrorBoundary as ErrorBoundary }` from `_index.tsx`, `$id.tsx`,
`new.tsx`, `edit.$id.tsx`, `picker.tsx` (same mechanism as Notices and ADR-003's example).
React Router renders "the closest error boundary" for errors from loaders, actions and
components, inside the parent layout (`_authenticated` header and nav stay), unlike today's root
boundary that replaces the whole document.

### D2. 22P02 mapped in infrastructure, on read-by-id paths (decided: OD-2 A)

**Revised (user, 2026-11-24, round 2 decision D; still OD-2 A, still in infrastructure):**
`findById`, `findByIdForUpdate` and `delete` in `DrizzleHazardousEventRepository` check the `id`
with `isWellFormedUuid` (hyphenated 8-4-4-4-12 hex, any case; same shape as the list filters'
`UUID_RE`) **before** sending any query. A malformed id throws
`new NotFoundError("HazardousEvent", id)` on the read paths, and `delete` returns normally
(no-op), honouring its "MUST NOT throw on no match" contract. Because no query runs, a caller's
open transaction stays usable. There is no 22P02 catch on these paths (round 3: the guarded
backstop was unreachable and was removed), so a 22P02 from a malformed `tenantId` (or any other
driver failure) propagates as a driver error instead of a quiet 404 or a silent delete no-op.
Consequence: Postgres-accepted but non-canonical forms (braced,
unhyphenated) are now not found; uppercase still resolves (pinned by a test).

Original wording (superseded): the read paths caught a driver 22P02 and threw `NotFoundError`, and
`delete` caught it and resolved; that aborted a caller's transaction on the read paths and also
mapped a malformed `tenantId` to not-found (SOLID and Gate 10 findings, round 1).

Scope of "malformed id": the route path id (`$id`, `edit.$id`, `delete.$id`), `new?parent=` and a
create/edit form `causeId`. List and picker query filters are **not** in scope: they already drop
a malformed UUID silently (`parseHazardousEventListFilters.ts:5-11` `uuidOrAbsent`, 6a design
Decision 7), which is the right outcome for a filter (not-found would be wrong). That existing
`UUID_RE` is also a precedent for alternative B below. `mapWriteError`'s existing 22P02 → `ValidationError` (write
paths, where 22P02 means a malformed column value, not a malformed key) is untouched.

Why here (ADR-003 Rule 2, Layer 3; Clean Architecture dependency rule): a pg error code is an
infrastructure concept. Mapping it in the adapter that owns the query means no use case, route
or REST controller ever sees it, and every caller gets the same answer.

Observable consequences per caller (all become 404 / not-found, never 500):

| Caller                                                                                                                         | Malformed id today | After D2                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------- |
| `$id` loader                                                                                                                   | 500 + SQL (dev)    | 404 boundary                                                                           |
| `edit.$id` loader/action (`requireEditableEvent`)                                                                              | 500                | 404 boundary                                                                           |
| `new` loader `?parent=`                                                                                                        | 500                | 404 boundary, same as a non-existent parent today                                      |
| `delete.$id` action (lookup via `GetHazardousEventByIdUseCase`)                                                                | 500                | `delete.not_found` toast (existing 6l mapping)                                         |
| `new`/`edit` action with a malformed `causeId` in the form body (`CreateHazardousEvent.ts:164`, `UpdateHazardousEvent.ts:412`) | 500                | `NotFoundError` → 404 boundary, identical to a well-formed but unknown `causeId` today |
| REST adapter (`presentation/rest`) by-id endpoints                                                                             | 500                | 404 via `DomainErrorFilter` (no code change there)                                     |

Alternatives:

- (B) Presentation-layer UUID shape check on `params.id` before calling the use case. Cheaper (no
  DB round trip) but covers route params only: `?parent=`, form `causeId`, REST and any future
  caller still hit raw 22P02, and the pg concept still leaks past infrastructure for them.
- (C) Application-layer id validation in each use case. Puts a persistence-format rule (Postgres
  `uuid` column) into the application layer and must be repeated per use case.
- (A+B) Both: B as a fast path, A as the guarantee. Not recommended for now (two places, same
  rule).

Recommendation: A. Requires a Red test proving PGlite raises 22P02 in a shape `pgErrorCode`
reads (task 2.1); if it does not, the repository test moves to `test:run3` and the reason is
recorded here.

### D3. Copy is translated in the boundary by error kind, not taken from `error.message` (decided: OD-3)

The boundary renders `t("error.<kind>.title")` and `t("error.<kind>.body")` from the
`hazardous-events` namespace. The envelope's `error.message` (English, developer-oriented, e.g.
"ViewData permission required", "HazardousEvent not found") is never rendered.

Why: ADR-003's envelope defines `message` as "human-readable, safe to display, localised";
ADR-001 says server-originated error text is translated; ADR-008 keeps error messages in the
file-based static-string workflow. Today's messages are none of those, and Notices renders them
raw (live: "Notice not found" under every locale). Rendering by kind fixes what the user sees
without changing the envelope contract. `DomainError.i18nKey` (`common.error.not_found`,
nestjs-i18n `{entity}` syntax) is not reused: it is the REST surface's key, its placeholder
syntax is not i18next's, and `entity` would render "HazardousEvent".

Alternative (A, ADR-literal): localise `error.message` on the server inside
`throwHazardousEventLoaderError` using the request's i18next instance. Every guard that calls the
helper (`requireViewDataPermission`, `requireEditDataPermission`, `requireWorkflowActionAuthorized`,
…) would need the route `context` threaded in. Larger change, touches every call site.
Alternative (C): mirror Notices (render `error.message`). Rejected: shows English developer text
under `/fr`, contradicts ADR-003's "localised".

Recommendation: D3 as written, and record that the envelope's `message` field remaining English
is a pre-existing ADR-003 gap shared with Notices (OD-3 asks whether to close it now with A).

### D4. Unexpected errors become an ADR-003 500 envelope with a traceId (decided: OD-4)

`throwHazardousEventLoaderError`'s non-`DomainError` branch keeps its `getPinoLogger().error(...)`
call and then throws `Response.json({ success: false, error: { code: "INTERNAL_ERROR", message:
<generic English>, traceId, timestamp } }, { status: 500 })` instead of rethrowing the raw error.
A thrown `Response` passed in (e.g. a redirect) is rethrown unchanged. No `details`.

Why: ADR-003 Layer 4 shows exactly this for programmer errors; ADR-003 "TraceId" and ADR-004
Consequences say users report the trace reference to support. Today a raw rethrow reaches the
browser sanitized ("Unexpected Server Error" in production, React Router docs) with **no
traceId**, so the generic fallback cannot show one. This modifies the existing
`hazardous-event-route-adapter` requirement "log and rethrow non-DomainError failures" (it
explicitly forbids the envelope today); the spec delta removes it and adds the replacement.

Alternative: keep rethrowing (Notices and the current spec). Rejected per "ADR wins".
Risk: React Router's own `handleError` server logging no longer sees these as thrown errors; the
helper already logs at `error` with the request context, so nothing is lost.

### D5. Namespaces load before anything can throw

Each UI route loader (`_index`, `$id`, `new`, `edit.$id`, `picker`) and each UI route action
(`new`, `edit.$id`) calls `getInstance(context).loadNamespaces(["hazardous-events", "common"])`
as its first awaited statement, before `requireUser`, `resolveTenantId`, permission guards and
use cases. Today it runs after them (`$id.tsx:23` after the 403 guard at `:21`; `edit.$id.tsx:78`
after `requireEditableEvent`), so a boundary rendered for 403/404 would get raw keys on SSR, and
`app/root.tsx:212-214` serialises the bundle at render time, so the client would hydrate with the
same gap. `edit.$id`'s action must gain the `context` argument for this. Redirect behaviour is
unchanged (loading resources has no side effects).

### D6. Layout and components (decided: OD-5; legacy-exempt per OD-1)

Rendered inside `MainContainer` with the same page title as the routes (`t("title")`, "Hazardous
events"), so the page header matches the list/detail pages. Content, in order:

1. Error title (`h2`), by kind.
2. Body text, by kind.
3. Trace reference row, only when `traceId` is present: label "Error reference", the id in
   `IBM Plex Mono` (design-system rule: mono for identifiers), and a copy button.
4. A visually-hidden polite live region that announces "Error reference copied" after a
   successful copy (WCAG 4.1.3: an in-page status change, not a change of context).
5. `BackLink` (existing, `presentation/web/BackLink.tsx`) to `/{lang}/he-preview` with
   `detail.back_to_list` ("Back to Hazardous events"), legacy's own back affordance.

Icon: `lucide-react` `TriangleAlert` (16/20 px per DESIGN.md), `aria-hidden`, replacing the root
boundary's PrimeIcons `pi-exclamation-triangle` (Phase 6: no PrimeReact icons). Styling follows
the other he-preview pages: `app/design-system/components/` primitives (React Aria `Button`,
`Link` via `BackLink`) and the legacy classes they already use (`mg-container`, `dts-*`); no new
hex values or arbitrary pixel values. `app/design-system/ui/` is not used (OD-1).

The container keeps `role="alert"` (Notices parity; it also announces when a delete fetcher error
replaces the list page client-side). On a full page load this is harmless (4.1.3 does not apply to
a change of context).

### D7. `delete.$id.tsx` gets no `ErrorBoundary` export (decided: OD-10)

The delete action is only called through a fetcher from the list page. React Router routes a
fetcher error to `findNearestBoundary(state.matches, routeId)` where `routeId` is the route that
called `useFetcher` (`node_modules/react-router/dist/development/lib/router/router.js:1102-1107`,
`lib/dom/lib.js:951`, v8.3.0). So an unexpected delete failure renders the **list route's**
boundary (D1), and an export on `delete.$id.tsx` would never render. Expected delete failures keep
returning toast data (6l); with D2 a malformed id now returns `delete.not_found` instead of 500.

### D8. Error envelope `details` carries field-level validation details only (decided: OD-7, ED-1, ED-2, ED-3)

**Rule (ADR-003 "Error Response Envelope": `details?: unknown; // field-level validation details
only`; Rule 4 "Never expose internal error details to the client").** When a `DomainError` becomes
an ADR-003 envelope on any surface:

- `details` SHALL be present only when the error is a `ValidationError` whose `context` has a
  string `field` key, and SHALL then be exactly `{ field }`. No other context key is copied.
- For every other `DomainError` (`NotFoundError`, `AuthorizationError`, `ConflictError`,
  `ConcurrentModificationError`, a `ValidationError` without a `field`), `details` SHALL be
  omitted. This drops, for example, `{ entity, id }` on not-found and
  `{ id, tenantId, reason, dependents }` on conflicts.
- Dropped context is **not** newly logged (OD-8 keeps ADR-004's "the boundary decides, usually
  nothing"); decided by ED-3.
- Unchanged: the REST filter's non-DomainError branches. `HttpException` object payloads (Zod
  `issues` from `NoticesController`'s `ZodBodyValidationPipe`) and `InvalidLocaleTagError`'s
  `{ supportedLocales }` are client-actionable validation details produced by the presentation
  layer itself, not raw domain context; they keep flowing into `details`. `DomainErrorFilter` keeps
  passing `context` to nestjs-i18n as interpolation `args` (server-side only, never serialised).

One pure function owns the rule so every producer agrees (ADR-003 Rule 3, "one error response
shape"): `toErrorResponseDetails(err: DomainError): { field: string } | undefined` in
`app/shared/errors/` (next to `ErrorResponse.ts`; it is technical cross-cutting code, ADR-009's
`app/shared/` category). No `DomainError` or `ErrorResponse` type changes.

Why this rule and not "copy `ValidationError.context` wholesale": no production `DomainError`
carries a structured field key today (grep of `new (ValidationError|...)(` in `app/`; the 6c
design notes the same under its Decision 17, which is why `extractFormFieldErrors` parses the
message instead). The only `{ field }` contexts are in tests
(`HazardousEventListRoute.test.ts:489`, `NoticesIndexRoute.test.ts:274`). An allowlist keeps the
door open for real field errors without leaking whatever a future context adds.

**Producers and consumers (blast radius):**

| Surface                                                                                                         | File                                                                                        | Owner        | Today                         | After D8    |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------ | ----------------------------- | ----------- |
| HE web loaders/actions                                                                                          | `app/domains/hazardous-events/presentation/web/throwHazardousEventLoaderError.server.ts:17` | HE           | `details: err.context`        | rule        |
| Notices web loaders                                                                                             | `app/domains/notices/presentation/throwNoticeLoaderError.server.ts:20`                      | Notices      | `details: err.context`        | rule (ED-1) |
| NestJS REST (all controllers; today only `NoticesController`, `/api/v2/notices`; HE has no REST controller yet) | `app/infrastructure/DomainErrorFilter.server.ts:72-75`                                      | **shared**   | `details: exception.context`  | rule (ED-1) |
| REST HttpException / InvalidLocaleTag                                                                           | same file, `:84-114`                                                                        | shared       | structured payload            | unchanged   |
| Web boundaries                                                                                                  | `HazardousEventErrorBoundary` (new), `NoticeErrorBoundary.tsx`                              | HE / Notices | never render `details`        | unchanged   |
| Root boundary                                                                                                   | `app/root.tsx:384-393`                                                                      | shared       | dev-mode `String(error.data)` | unchanged   |

Specs touched: `hazardous-event-route-adapter` ("HE list and detail loaders throw a structured
error response for a DomainError"), `notices-route-adapter` ("Notices list loader throws a
structured error response for DomainError"), `domain-error-filter` ("DomainErrorFilter includes
context details when present"). Tests that assert today's behaviour:
`tests/integration/nestjs/DomainErrorFilter.test.ts:213-216` (`{ entity, id }` on NotFound, flips
to absent), `:219-223` (unchanged), `:315-321` (HttpException, unchanged);
`HazardousEventListRoute.test.ts:489` and `NoticesIndexRoute.test.ts:274` (`ValidationError` with
`{ field: "page" }`, unchanged under the rule); `NoticeErrorBoundary.test.tsx:78-85` (fixture
only, unchanged). **This changes shared code used by Notices and by every future NestJS REST
controller, and removes `details` from `/api/v2/notices` not-found/conflict responses: an
externally visible API change** (no known consumer relies on it; accepted with ED-1).

### Notices evaluated against the ADRs (reference, not precedent)

| `NoticeErrorBoundary` behaviour                                                                           | ADR / source                                                                                                                                      | 6b                                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `useRouteError` + `isRouteErrorResponse` first                                                            | React Router docs; ADR-003 example                                                                                                                | Keep                                                                                                            |
| Renders `body.error.message` (English)                                                                    | ADR-003 envelope "localised"; ADR-001                                                                                                             | Deviate: translated copy by kind (D3)                                                                           |
| Non-Response fallback with no traceId                                                                     | ADR-003 Layer 4 (500 envelope with traceId)                                                                                                       | Deviate: D4 gives a traceId; non-Response still generic                                                         |
| traceId as a bare `<button>` whose name is the UUID, no label, no feedback, unhandled clipboard rejection | WCAG 2.4.6 (labels describe purpose: a bare UUID does not say "copy"), 4.1.3 status messages; React: boundaries do not catch event-handler errors | Deviate: labelled React Aria button, live-region feedback, try/catch in the handler, id also selectable as text |
| No heading, no page header, no way back                                                                   | Phase 6 golden rule (legacy pages have a header and back link); WCAG 1.3.1/2.4.6                                                                  | Deviate: `MainContainer` + heading + `BackLink`                                                                 |
| `role="alert"` container                                                                                  | WCAG 4.1.3 (useful for in-place replacement)                                                                                                      | Keep                                                                                                            |
| Malformed id → 500                                                                                        | ADR-003 Rule 2                                                                                                                                    | Deviate for HE (D2); Notices itself out of scope                                                                |

### Ground-truth checklist (content and interaction) for Gate 9c

Reference-source type: **(e) no prototype; partial legacy reference.** Legacy HE has no
route-level boundary; its only equivalent is the root boundary (`app/root.tsx:372-440`: icon +
title + message + "Return to Home" + support contact), read as code and seen live. Everything
legacy has no equivalent for is a new design decision and is listed as such.

- Page header: `MainContainer` title "Hazardous events" (same as list/detail). New vs legacy.
- Order: icon + error title (h2) → body → trace reference row (conditional) → back link.
- Titles/bodies (EN, sentence case, no em dashes; FR in spec):
  - not_found: "Hazardous event not found" / "The record does not exist or you do not have access to it."
  - forbidden: "Access denied" / "You do not have permission to do this."
  - invalid_request: "The request could not be processed" / "Check the information you entered and try again."
  - conflict: "The record could not be saved" / "It changed or is linked to other records. Reload the page and try again."
  - unexpected: "Something went wrong" / "An unexpected error occurred. Please try again later." (legacy root copy "Something went wrong. Please try again later." and `common:error.generic_retry`)
- Trace reference: label "Error reference", value in mono, button "Copy error reference",
  live-region "Error reference copied". Shown only when a traceId exists.
- Back affordance: "Back to Hazardous events" to the list (existing key `detail.back_to_list`,
  legacy capitalisation kept for parity).
- Not shown, ever: SQL, stack, `error.message`, `details`, status code number as the title
  (legacy dev-mode "404 [object Object]" is a defect, not a parity target).
- States: one error state per kind; there is no empty/loading state (boundary is synchronous).
- Emphasis: title is the only bold element.
- Support-contact line from the root boundary
  ("If the problem persists, please contact support at …", needs `SUPPORT_URL`/`SUPPORT_EMAIL`
  from the root loader). Decided: not added (OD-5b).

### Tokens and components

Legacy-exempt (OD-1): HE's existing legacy-parity set in `app/design-system/components/`
(`Button` for copy, `Link` via `BackLink`) and the legacy classes the other he-preview pages
already use; `lucide-react` icon. No v0.7.2 tokens are introduced, so HE stays visually
consistent until the HE UI upgrade iteration re-skins it as a whole.

### Responsive

Single column at every width; the trace id wraps (`break-all`) rather than overflowing at 320 px;
back link and copy button stay at least 24 x 24 CSS px.

### Accessibility and keyboard (WCAG 2.2 AA)

- Tab order: copy button (if shown) → back link; Enter/Space activate the button, Enter the link;
  visible focus indicator on both, never obscured (2.4.7, 2.4.11).
- Accessible names: copy button "Copy error reference" (visible text = name, 2.5.3); icon
  `aria-hidden="true"`.
- Status announcement on copy via polite live region (4.1.3).
- Heading structure: page `h1` from `MainContainer`, error title `h2` (1.3.1, 2.4.6).
- Copy never relies on colour alone (icon + text title).
- Target size ≥ 24 x 24 CSS px (2.5.8).
- axe tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` via
  `runWcag22A11yCheck` (`tests/e2e/helpers/a11y.ts`).

### Copy and localisation

New keys in `locales/{en,fr}/hazardous-events.json` under `error.*` (see spec for the full list
and FR text). Sentence case, no em dashes, no placeholder copy. Run `yarn i18n:extractor` if the
project's extractor covers this namespace.

### Documented deviations (need human approval)

- From Notices: see the table above.
- From legacy: boundary renders inside the app layout (legacy root boundary replaces the
  document); no "Return to Home" (replaced by the HE back link); missing id is 404, not legacy's
  500; Lucide icon instead of PrimeIcons.
- From the design system: the whole boundary is legacy-styled by agreement (OD-1,
  `legacy-exempt`); recorded in the Gate 9 report. Accessibility requirements (WCAG 2.2 AA) still
  apply in full.
- Approved round 2 (user, 2026-11-24):
  - C1: the error content uses the legacy `dts-alert dts-alert--error` panel
    (`app/frontend/components/ErrorBoundary.tsx` precedent), not the root page's white card.
  - C2: the icon is `size-5` (17.5 px at the 14 px root), not 16/20 px.
  - C3: the back link is last, after the alert, while the detail page puts it first.
  - B1: `BackLink` text and border use `--color-dts-action` (`text-dts-action`,
    `border-dts-action`) instead of legacy's `blue-500` (3.76:1, fails WCAG 1.4.3; legacy's own
    PrimeReact back button fails too). Applies to the detail page and the error boundary; the
    new/edit breadcrumb already uses this token. Each page keeps its own layout.
  - B2 not fixed: no visible focus ring on the back link (PrimeReact `lara-light-blue/theme.css`
    redefines `--focus-ring`; app-wide). Deferred as DEF-062.

### Expected Gate 9 evidence

- 9a: `yarn check:design-system --verify-spec --change ca-he-error-boundary --base origin/dev`
  passes (legacy-exempt: spec metadata verified, token scans skipped by the checker); skill
  checklist items that still apply to legacy-exempt code (no PrimeReact imports, Lucide icons,
  accessible names on icon-only controls, no em dashes, sentence-case new copy).
- 9b: Playwright `runWcag22A11yCheck` on `/en/he-preview/<missing uuid>`,
  `/en/he-preview/not-a-uuid`, `/fr/he-preview/<missing uuid>`; keyboard sequence Tab → copy
  button → Enter (announcement present) → Tab → back link.
- 9c: `capturePrototypeStateScreenshots` for not_found, unexpected (forced), FR not_found, at
  desktop and 375 px, into `test-results/gate-9/ca-he-error-boundary/`; parity checklist above
  scored in `openspec/changes/ca-he-error-boundary/evidence/gate-9-report.md`, audited by a fresh
  subagent (`visual-parity-reviewer` against legacy HE: the legacy root boundary for the shared
  elements and the other he-preview pages for header, buttons and back link).

### Before `/opsx:apply` (human review checklist)

- [x] UI classification is correct (`legacy-exempt`, OD-1).
- [x] The design-system release/tag and commit SHA are recorded (OD-9 accepted 2026-11-23).
- [x] The feature-prototype path and immutable reference are recorded, or a valid exception is approved (OD-6 approved 2026-11-23).
- [x] The prototype covers the required flow and material states (n/a unless OD-6 says otherwise).
- [x] Accessibility and keyboard expectations are stated.
- [x] Responsive expectations are stated.
- [x] Acceptance criteria distinguish design-system compliance from prototype parity.
- [x] Known deviations or unresolved decisions are explicit (none open; see Resolved Decisions).
- [x] The prototype is approved as the design hand-off, or the not-required exception is approved.

### Test infrastructure

- Unit (Vitest, node): `mapRouteErrorToView.test.ts`.
- DOM (jsdom, `*.dom.test.tsx` beside the component, as the other HE components): boundary
  rendering per kind, copy success/failure, no leakage. Uses `createRoutesStub` or a
  `useRouteError` mock, following `tests/unit/domains/notices/presentation/NoticeErrorBoundary.test.tsx`.
- PGlite (`yarn test:run2`): repository 22P02 mapping in
  `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`; route loaders/actions in
  `tests/integration/domains/hazardous-events/routes/*Route.test.ts` (thrown Response status/code
  for a malformed id; namespaces loaded on the 403 path; 500 envelope for a forced plain `Error`).
- Playwright (`yarn test:e2e`, PORT=4000, existing `e2eDbGuard`): new
  `tests/e2e/hazardous-events/he-preview-error-boundary.spec.ts`. Forcing a DomainError without
  code changes: a valid-but-absent UUID (NotFoundError via the real use case); malformed id via
  D2.
- fieldsDef / Form-CSV-API pipeline: no impact (CA routes only).
- D8: `tests/unit/shared/errors/toErrorResponseDetails.test.ts` (new),
  `tests/integration/nestjs/DomainErrorFilter.test.ts`, Notices and HE route tests.
- Mutation testing (task 9.11) tooling limitation: Stryker's bundled Babel crashes instrumenting
  `DrizzleHazardousEventRepository.server.ts` (`Printer.TSTypeParameter`, same family as DEF-041),
  so its malformed-id handling has no mutation coverage; it is covered by the PGlite repository,
  use-case and route tests. `isWellFormedUuid.ts` (round 2) scored 0/12: its regex is a
  module-level constant, and in this setup the vitest runner does not apply such static mutants
  (same cause as round 1's `INTERNAL_ERROR_MESSAGE`); `isWellFormedUuid.test.ts` covers it. Neither
  is registered as a new DEF item.
- New TypeScript: `HazardousEventErrorKind`, `HazardousEventErrorView`,
  `toErrorResponseDetails(err: DomainError): { field: string } | undefined`. No design-system
  component changes. No Drizzle schema change; `ErrorResponse` unchanged.

## Risks / Trade-offs

- [Risk] A malformed `causeId` that used to 500 now renders the not-found page for the whole
  form submission rather than a field error. → Same as today's well-formed unknown `causeId`;
  a field-level message is a separate improvement (not in scope).
- [Risk, resolved round 2] A 22P02 from another value (e.g. a malformed `tenantId`) could be
  mistaken for a malformed id. → The read-by-id paths no longer catch 22P02 at all (only the
  pre-check decides); tests pin that a malformed `tenantId` surfaces as the driver error on
  `findById` and `delete`.
- [Risk, resolved round 2] A 22P02 inside a caller's open transaction aborts that transaction.
  → The id is checked before any query, so a malformed id never reaches Postgres; PGlite tests pin
  that the caller's `tx` stays usable after the `NotFoundError` on `findById` and
  `findByIdForUpdate`, and after a malformed-id `delete`.
- [Limitation, D4 scope] D4 only covers failures routed through `throwHazardousEventLoaderError`.
  These awaits are not wrapped today and would still surface as a sanitized non-Response error
  (generic message, **no** error reference): `new.tsx:43-48` and `edit.$id.tsx:80-85`
  (taxonomy + validator-candidate loads), the `composeWorkflowAction` call in both actions,
  `request.formData()`, and the list/picker `getCountrySettingsFromSession`. Resolved by OD-11:
  all of them are routed through the helper in this change, plus the submit's
  `requireValidValidatorIds` (round 2, A2). Still out of scope (round 2, A2): unexpected failures
  of the authentication, session, tenant and permission lookups that run before those steps
  (`requireUser`, `resolveTenantId`, the permission guards, `getUserRoleFromSession`,
  `loadNamespaces`, `redirectWithMessage`); they reach the boundary without an error reference.
- [Risk] D4 changes the existing spec'd contract; any test asserting "rethrows the same Error
  instance" must be updated in the same change. → Listed in tasks.
- [Risk] `role="alert"` on SSR content may be announced twice by some screen readers on
  hydration. → Verified in Gate 9b manual keyboard/AT check; drop to a plain region if observed.
- [Trade-off] D3 leaves the envelope `message` English (pre-existing, shared with Notices).
- [Risk] D8 removes `details` from `/api/v2/notices` not-found/conflict bodies (external API). →
  No known consumer reads it; called out in the PR (ED-1); REST validation `details` (Zod) are
  unchanged.
- [Trade-off] Legacy-exempt means the boundary carries legacy styling that the HE UI upgrade
  iteration will redo with the rest of HE. → Accepted by the user (OD-1); DEF-014 owns the folder
  merge, due before Disaster Event UI work.

## Migration Plan

No DB migration. Rollback is reverting the commit(s). The `/api/v2/notices` `details`
removal (D8) is noted in the PR for API consumers.

## Resolved Decisions (user, 2026-11-23)

| ID    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where it lands                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OD-1  | **Final (user, 2026-11-23, replaces the earlier "merge in 6b" instruction): no design-system folder merge in 6b.** 6b builds on `app/design-system/components/` (HE legacy-parity set); `app/design-system/ui/`, `AccessManagementPage` and the #840 `design-system-components` requirements are untouched; `ui-classification: legacy-exempt`. User reasoning: every new screen must follow the new design system, and adding `legacy-*` variants to `ui/` would be a loophole for keeping the legacy design; PR #840's merged work must not be modified; unification (merging `components/` into `ui/`) is owned by another team member and is due before Disaster Event UI work (DEF-014); HE deliberately keeps its legacy look until a later "HE UI upgrade to the new design system" iteration, which is why Phase 6 parity is legacy parity | metadata block, D6, task 6.4, DEF-014, roadmap Phase 6 note                                              |
| OD-2  | A: repository read-by-id methods map 22P02 (`findById`/`findByIdForUpdate` to `NotFoundError`, `delete` to its no-match no-op)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | D2, spec `hazardous-event-repository-port`                                                               |
| OD-3  | Status-keyed translated copy in the boundary; never render `error.message`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | D3                                                                                                       |
| OD-4  | 500 `INTERNAL_ERROR` envelope with traceId; route-adapter requirement replaced; affected tests listed in task 4.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | D4, spec `hazardous-event-route-adapter`                                                                 |
| OD-5  | In-layout boundary: heading, body, copyable error reference, `BackLink`, Lucide icon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | D6                                                                                                       |
| OD-6  | Feature-prototype `not-required` exception approved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | metadata block                                                                                           |
| OD-7  | **Changed from the recommendation: enrolled in 6b.** Envelope `details` carries only field-level validation details per ADR-003. Rule in D8; scope and logging choices open as ED-1 to ED-3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | D8, specs `hazardous-event-route-adapter`, `notices-route-adapter`, `domain-error-filter`                |
| OD-8  | Keep ADR-004 (no new logging of thrown DomainErrors)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | no change                                                                                                |
| OD-9  | Accept `v0.7.2` + `a86cc3a62378871e93cbfa14aa69740201b8c556`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | metadata block                                                                                           |
| OD-10 | No `ErrorBoundary` export on `delete.$id.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | D7                                                                                                       |
| OD-11 | Wrap the listed unwrapped call sites in this change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | D4, task 4.2                                                                                             |
| #666  | **Dropped** (user, 2026-11-23): the earlier approval to fix the raw `#666` at `HazardousEventListPage.tsx:188` is withdrawn. Under `legacy-exempt` the checker skips token scans, so it no longer blocks `check:design-system`, and HE legacy code stays as is until the HE UI upgrade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | no task                                                                                                  |
| OD-5b | Do **not** add the root page's support-contact line to the HE boundary (it needs the root loader's untyped `env`; legacy HE has no line of its own; the root page still shows it for non-HE failures)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | D6, ground-truth checklist                                                                               |
| ED-1  | Apply the `details` rule to all three producers: HE web helper, Notices web helper, shared `DomainErrorFilter` (changes shared code and the `/api/v2/notices` error body)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | D8, specs `hazardous-event-route-adapter`, `notices-route-adapter`, `domain-error-filter`, tasks 8.3-8.5 |
| ED-2  | Only `{ field }` from a `ValidationError` context counts as field-level; every other key and error type is dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | D8, `toErrorResponseDetails`                                                                             |
| ED-3  | Do not log the dropped context (consistent with OD-8)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | D8                                                                                                       |

### Round 2 (user, 2026-11-24, after the 6b review)

| ID    | Decision                                                                                                                       | Where it lands                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A1    | Spec wording limited to `details` and ids; the envelope `message` may name the entity type                                     | specs `hazardous-event-route-adapter`, `domain-error-filter` |
| A2    | Wrap `requireValidValidatorIds` in the create/edit actions; auth/session/tenant awaits are out of the trace-reference scenario | Risks (D4 scope), spec `hazardous-event-error-boundary`      |
| C1-C3 | Legacy alert panel, `size-5` icon, back link last: approved deviations                                                         | Documented deviations                                        |
| D     | UUID-shape check in the repository read-by-id methods before querying; no 22P02 catch (round 3); still OD-2 A                  | D2, spec `hazardous-event-repository-port`                   |
| E1    | Clear-then-set the copy announcement so a repeat copy is announced                                                             | D6                                                           |
| E2    | Neutral 403 copy: "You do not have permission to do this." / "Vous n'avez pas l'autorisation d'effectuer cette action."        | spec copy table, checklist                                   |
| B1    | `BackLink` colour to `--color-dts-action`                                                                                      | Documented deviations                                        |
| B2    | Back-link focus ring not fixed in 6b                                                                                           | DEF-062                                                      |
| E3    | Duplicate-submit risk after a committed create (pre-existing) not fixed in 6b                                                  | DEF-063                                                      |
| F     | SOLID nits accepted as-is                                                                                                      | none                                                         |

No open decisions remain (user, 2026-11-24).

## Sources

- ADR-003 Error Handling Architecture (`_docs/decisions/ADR-003-error-handling-architecture.md`):
  Layers 1-4, Error Response Envelope ("message … localised"), React Router Error Boundaries,
  TraceId, Rules 2/4/6. Basis for D1, D2, D3, D4.
- ADR-004 Logging and Traceability: Log Level Discipline, Error Handling Rule 4, Consequences
  (traceId in the UI). Basis for D4, OD-8.
- ADR-007 Success Response Shape: error envelope unchanged on every surface; success stays plain.
  D4 keeps the envelope shape; no success shape change.
- ADR-009 Clean Architecture Module Structure: presentation adapters live in
  `presentation/web/` (D1); technical cross-cutting code lives in `app/shared/` /
  `app/infrastructure/` (D8 helper).
- `openspec/config.yaml` UI Design Authority ("Coexistence during migration", `legacy-exempt`)
  and `scripts/check-design-system.ts` (token scans run only for `react-aria`, line 400): basis for
  the `legacy-exempt` classification (OD-1).
- Hazardous Events roadmap, Phase 6 intro (golden rule, line 2407): legacy parity for HE until the
  HE UI upgrade iteration.
- ADR-001 Multilingual Strategy (I18nService, file-based namespaces) and ADR-008 (error messages
  are static strings, file-based). Basis for D3. ADR-006 not used (unapproved draft).
- React Router, Error Boundaries: https://reactrouter.com/how-to/error-boundary (closest boundary
  renders; `isRouteErrorResponse`; production sanitizes server errors; thrown data is not
  sanitized). D1, D4.
- React Router, Route Module: https://reactrouter.com/start/framework/route-module (`ErrorBoundary`
  renders instead of the route component). D1, D6.
- React Router 8.3.0 source (installed): `lib/router/router.js:1102-1107`,
  `lib/dom/lib.js:951` (fetcher errors go to the calling route's nearest boundary). The fetchers
  how-to (https://reactrouter.com/how-to/fetchers) is silent on this, so the source is the
  authority. D7.
- React, error boundaries: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
  (do not catch event-handler errors or errors in the boundary itself). D6 copy-handler try/catch.
- OWASP Error Handling Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html (details logged
  server-side, not returned; no stack/SQL). D1, D4.
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457.html (considered; vet exposed
  details). Not adopted: ADR-003 fixes the envelope shape, and RFC 9457 targets HTTP APIs, not an
  SSR error page.
- Robert C. Martin, The Clean Architecture:
  https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html (dependency rule;
  outer-circle data formats do not cross inward). D2.
- Eric Evans, Domain-Driven Design (2003), Part II ch. 4 "Isolating the Domain" (layered
  architecture) and Vaughn Vernon, Implementing Domain-Driven Design (2013), ch. 4
  "Architecture" and ch. 12 "Repositories": books, cited by chapter only, no quotation. They
  support keeping persistence concerns inside the repository; D2.
- WCAG 2.2 Understanding 4.1.3 Status Messages:
  https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html (status messages exclude a
  change of context such as a new page; applies to the "copied" announcement). D6.
  Other criteria cited (1.3.1, 2.4.6, 2.4.7, 2.4.11, 2.5.3, 2.5.8) are from the WCAG 2.2
  Recommendation, https://www.w3.org/TR/WCAG22/, listed in the project's design-system-check skill.
