> **Superseded by Decision 18 (2026-07-23), per [ADR-008](../../../_docs/decisions/ADR-008-user-content-not-translated.md):**
> Decisions 3, 4, 10, 13, 14, 16, and 17 below all assume `titleJson`/`bodyJson` are locale-map
> JSONB columns resolved per-request. That model is dropped entirely — Notices content is
> single-locale, stored as plain `title`/`body` text. Those decisions are kept for historical
> record (they document real bugs found and fixed against the old model) but no longer describe
> the shipped design. Decision 18 is the current source of truth for content; Decision 19 covers
> the new `nestjs-i18n` wiring for error-message strings.

## Context

3c (NestJS HTTP server + `DomainErrorFilter`) and 4h (`NoticesModule` with Create/List/GetById)
are merged to `dev` and verified during Phase 0 of this proposal:

- `app/infrastructure/CoreModule.server.ts` imports `NoticesModule` and registers
  `DomainErrorFilter` as `APP_FILTER`.
- `app/init.server.tsx`'s `bootstrapHttpServer()` calls `NestFactory.create(CoreModule)`,
  `app.setGlobalPrefix("/api/v2")`, then `app.listen(apiPort)` — this is the exact call site
  the Swagger bootstrap must slot into (between `setGlobalPrefix` and `listen`), not
  `CoreModule.server.ts` as the roadmap's file list loosely suggested.
- `app/domains/notices/infrastructure/NoticesModule.server.ts` registers `DrizzleNoticeRepository`
  under `NOTICE_REPOSITORY` and exports the three Phase-4 use cases via `useFactory` providers
  that construct `ILogger` via `getPinoLogger()`.

Nothing in the codebase today implements: a NestJS `CanActivate` guard (all auth is
Remix-loader-only, via `authLoaderWithPerm` in `app/utils/auth.ts`), a `resolveLocale()`
utility, `UpdateNoticeUseCase`/`DeleteNoticeUseCase`, or any OpenAPI/Swagger wiring. `zod` is
already a dependency (`^3.24.1`); `nestjs-zod` and `@nestjs/swagger` are not installed.

## Goals / Non-Goals

**Goals:**

- Five working REST endpoints under `/api/v2/notices`, authenticated via the existing session
  cookie, tenant-scoped, locale-resolved, zod-validated, documented at `/api/v2/docs`.
- Reuse existing session/error/logging infrastructure without forking it for the NestJS surface.
- Establish the auth-guard and request-context patterns this pilot's future REST controllers
  (beyond Notices) will copy.

**Non-Goals:**

- Bearer token / JWT auth (deferred — see ADR-006 draft, out of scope here).
- Audience-based filtering of notices (deferred per 4a's note; all use cases still return all
  tenant notices regardless of `audience`).
- Any change to the web channel (5a/5b routes, `NoticeErrorBoundary`) — untouched.
- Extending `withRequestContext`'s `seed` parameter to accept `tenantId` directly — this is
  shared infrastructure used by every future domain; changing its signature is a separate,
  cross-cutting concern (see Decision 2).

## Decisions

### Decision 1 — `SessionAuthGuard` reuses `getUserFromSession`/`getCountryAccountsIdFromSession`

via a synthesised Fetch `Request`, not a parallel cookie-parsing implementation

`sessionCookie().getSession(cookieHeader)` and the session helpers in `app/utils/session.ts`
all expect a Fetch API `Request` (they call `request.headers.get("Cookie")`). NestJS's default
HTTP adapter is Express (`@nestjs/platform-express`), whose raw request exposes
`req.headers.cookie` as a plain string, not a Fetch `Headers` object.

`SessionAuthGuard.canActivate()` builds a minimal `new Request(url, { headers: { Cookie:
req.headers.cookie ?? "" } })` from the Express request and passes it to the existing
`getUserFromSession()` / `getCountryAccountsIdFromSession()` unchanged. This was chosen over
duplicating cookie-parsing logic in the guard, because a second implementation of session
lookup is exactly the kind of drift ADR-003's Layer 3 error-mapping section warns against for
error types, and applies equally to session logic. Throws `UnauthorizedException` (NestJS
built-in, `HttpException`, status 401) when no valid session or no `countryAccountsId` is
found — this flows through `DomainErrorFilter`'s existing `HttpException` branch (already
merged, already anticipated 5c per its own inline comment) with `code: "HTTP_ERROR"`. No new
`DomainError` subtype needed; the existing hierarchy (404/422/403/409) has no 401 case and
none is added — `UnauthorizedException` is the correct, minimal-footprint choice.

Sets `request.tenantId` and `request.userId` on the Express request object (cast via a typed
`AuthenticatedRequest` interface extending Express's `Request`) so the controller methods can
read them without re-deriving.

**Alternative considered**: a `nestjs-i18n`-style resolver reading the session directly via
Nest's own request-scoped DI (`@Inject(REQUEST)`). Rejected — ADR-001 explicitly says
`nestjs-i18n` is adopted "only when NestJS exposes external HTTP endpoints," which is now true,
but request-scoped providers change every provider in the same object graph to request scope,
which would force `NoticesModule`'s existing singleton-scoped use cases into request scope too.
Out of proportion for one guard.

### Decision 2 — Request context is opened once per request via `NoticesModule.configure()`

middleware, not inside each of the five controller methods

The intent's literal wording ("wraps execution in `withRequestContext({ traceId, tenantId })`")
does not match `withRequestContext`'s actual signature — `seed` only accepts `{ traceId }`
(verified in `app/utils/requestContext.server.ts`). Extending that signature to accept
`tenantId` would touch shared infrastructure used by every current and future caller
(`requestContextMiddleware` in `app/middleware/requestContext.server.ts` and everything that
already relies on it) — out of scope for a Notices-specific change.

Instead, `NoticesModule` implements `NestModule.configure()` to apply a small
`RequestContextMiddleware` (Express middleware, registered only for the `notices` route) that:

1. Calls `withRequestContext(() => new Promise(resolve => { next(); res.on("finish", resolve); }), { traceId: crypto.randomUUID() })` to open exactly one ALS scope for the whole
   Express middleware chain — guard included, since Nest guards run inside this Express
   middleware's downstream chain, not before it.
2. Nothing else — `ctx.tenantId`/`ctx.userId` are populated by `SessionAuthGuard` itself
   (`getRequestContext()` then mutate), mirroring exactly how the root `requestContextMiddleware`
   mutates the store after resolving session, rather than pre-seeding it.

This gives the guard's `getUserFromSession()` call the same request-scoped memoization Remix
loaders already get, and the controller methods read `getRequestContext()?.traceId` for
logging without re-deriving one. Doing this once in module config — rather than open-close in
five controller methods — avoids five copies of the same boilerplate and avoids the bug class
where a future sixth endpoint forgets to wrap itself.

**Alternative considered**: a NestJS `Interceptor` instead of Express middleware. Rejected —
interceptors run _after_ guards in the Nest lifecycle, so the guard's session lookup would
still miss the ALS scope; middleware runs before guards, which is what's needed here.

### Decision 3 — `resolveLocale()` is a pure function; it does not query the DB itself

```ts
// app/shared/i18n/resolveLocale.ts
export interface LocaleResolutionInput {
	acceptLanguageHeader: string | null;
	userPreferredLocale: string | null; // always null today — see below
	tenantDefaultLocale: string | null;
	supportedLocales: readonly string[]; // VALID_LANGUAGES from app/utils/lang.backend.ts
}
export function resolveLocale(input: LocaleResolutionInput): string;
// Throws InvalidLocaleTagError (new, see below) when acceptLanguageHeader is syntactically
// invalid per BCP 47 — never when it is merely unsupported.
```

Kept as a pure function — no `Request`, no DB client — so it is unit-testable without mocks
and reusable by any future NestJS controller. The controller resolves each input field itself:
`acceptLanguageHeader` from the Express request header, `userPreferredLocale` always passed as
`null` (see below), `tenantDefaultLocale` via a direct query against
`instanceSystemSettingsTable` scoped by `countryAccountsId` (the DB-backed equivalent of
`getCountrySettingsFromSession`'s `.language` field, since a NestJS controller has no Remix
session object to read `countrySettings` from).

**`user.preferredLocale` does not exist as a column** (`app/drizzle/schema/userTable.ts` has
no such field; ADR-001 calls it "a hook point only", and the existing `findLocale()` in
`app/middleware/i18next.server.ts` already skips it with a commented-out call). `resolveLocale()`
must do the same: accept the parameter, but the controller always passes `null` until the
column exists — no dead DB query, no behavioural drift from the established convention.

**Invalid vs. unsupported, precisely**: `resolveLocale()` parses `acceptLanguageHeader` with a
lightweight BCP 47 syntax check (language subtag regex, not a full RFC 4647 negotiator — DELTA
does not need quality-value (`q=`) negotiation, only a single preferred tag). A syntactically
malformed tag (e.g. `"xx_yy!!"`) throws `InvalidLocaleTagError` (new — see Decision 4). A
syntactically valid but unsupported tag (e.g. `"de"`, not in `VALID_LANGUAGES`) is treated
exactly like an absent header: falls through the chain silently.

### Decision 4 — `InvalidLocaleTagError`: a framework-agnostic `Error` subtype, not `ValidationError`,

not `AuthorizationError`, not a raw `BadRequestException`

The Pilot Complete Gate requires 400 for a malformed `Accept-Language` tag, but `ValidationError`
is already mapped to 422 (matches request-body validation) — using it unmodified would give the
wrong status. Three options existed: (a) throw `BadRequestException` (Nest built-in, 400) directly
from `resolveLocale()`; (b) add a small `DomainError` subtype with `statusHint = 400`; (c) add a
small, framework-agnostic `Error` subtype that `DomainErrorFilter` recognizes explicitly by type.

(a) was tried first and reverted: `resolveLocale()` is a shared utility with no NestJS
dependency anywhere else in its implementation — importing `BadRequestException` from
`@nestjs/common` solely to throw it is a framework leak into what is otherwise a pure,
framework-agnostic module (Decision 3), and it does not compose with a future non-NestJS caller.
(b) was rejected because `DomainError` (ADR-003) is reserved for "the domain speaking" — a
malformed `Accept-Language` header is a request-shape problem (like a malformed path param),
not a domain invariant violation.

Chosen: **(c) — `InvalidLocaleTagError extends Error`**, defined in `resolveLocale.ts` itself
with its own `code = "INVALID_LOCALE_TAG"` and `supportedLocales` fields, no `@nestjs/common`
import. `DomainErrorFilter` gets a dedicated `instanceof InvalidLocaleTagError` branch (it is
not an `HttpException`, so the generic `HttpException` branch never sees it) mapping it to 400
with the same ADR-003 envelope shape as every other branch: `error.code`, `error.message`, and
`error.details: { supportedLocales }`.

### Decision 5 — two separate `ZodValidationPipe` configurations: default (400) for path

params, custom exception factory (422) for request bodies

`nestjs-zod`'s `ZodValidationPipe` throws `BadRequestException` (400) by default for every
failure — verified against the current library docs (`nestjs-zod` v5.4.0). The Pilot Complete
Gate requires the _opposite_ status for two of the three validated inputs:

- `NoticeIdParam` (`:id` UUID, `@Param()`) → 400 on failure — matches the pipe's default, no
  customization needed.
- `CreateNoticeRequest` / `UpdateNoticeRequest` (`@Body()`) → 422 on failure — requires
  `nestjs-zod`'s `createZodValidationPipe({ createValidationException: (zodError) => new
UnprocessableEntityException({ message: "Validation failed", details: zodError.issues }) })`,
  instantiated once and applied inline as a parameter decorator on the `POST`/`PUT` handlers'
  `@Body()` (`@Body(new ZodBodyValidationPipe(...))`), not globally — the id-param pipe must
  keep the default 400.

This asymmetry is easy to miss (a single global `ZodValidationPipe` would make one of the two
Pilot Complete Gate assertions fail), so it is called out explicitly here rather than left to
tasks.md phrasing alone.

### Decision 6 — OpenAPI bridge uses `cleanupOpenApiDoc()`, not `patchNestJsSwagger()`; UI at

`/api/v2/docs`, raw document at `/api/v2/docs-json`

The roadmap names `patchNestJsSwagger()`. Verified against `nestjs-zod`'s current README
(v5.4.0, the latest installable release): no such function exists. The current integration is:

```ts
const document = SwaggerModule.createDocument(
	app,
	new DocumentBuilder().setTitle("DELTA Notices API").setVersion("2.0").build(),
);
SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document));
```

called in `app/init.server.tsx`'s `bootstrapHttpServer()`, after `app.setGlobalPrefix("/api/v2")`
and before `app.listen(apiPort)`, so the global prefix applies and the final path is
`/api/v2/docs`. **Open question, not assumed**: whether NestJS's global prefix is applied to
`SwaggerModule.setup`'s path automatically in the installed `@nestjs/core` version, or whether
the setup path must be given as `"api/v2/docs"` (bypassing the prefix) — tasks.md includes an
explicit integration test that resolves this empirically rather than by assumption.

**UI vs. raw document (revised after initial implementation)**: `SwaggerModule.setup()` mounts
two things by default — the interactive HTML explorer at the given path, and the raw JSON
document at that path's `-json` suffix (`jsonDocumentUrl`, not overridden). The first pass of
this change disabled the UI (`ui: false`) so `GET /api/v2/docs` itself returned the raw JSON
document directly, matching the spec's literal original wording. Revised: keep the default
UI — it is genuinely useful for anyone exploring the API by hand, and disabling it discards
`SwaggerModule.setup()`'s normal behavior for no benefit. `GET /api/v2/docs` now serves the
interactive UI (`Content-Type: text/html`); `GET /api/v2/docs-json` serves the raw document
that `specs/openapi-docs-bootstrap/spec.md`'s "covers all five endpoints" assertion inspects.

**Docs endpoints are intentionally left unauthenticated (raised in code review, resolved by
explicit user decision)**: neither `/api/v2/docs` nor `/api/v2/docs-json` sits behind
`SessionAuthGuard` — the guard is applied at the `NoticesController` level, and Swagger is
mounted directly on the app in `bootstrapHttpServer()`. DELTA is an open-source project, so the
API schema itself is not sensitive information — anyone can already read it from the source.
What matters is that every actual data-bearing endpoint still requires authentication, which it
does. This is a deliberate choice, not an oversight; it is not revisited here.

Because `zod` is v3 in this repo and `nestjs-zod` v5's README states the zod-v3 OpenAPI
conversion path is a "deprecated custom converter" (v4 uses `z.toJSONSchema()` natively), this
still works today but is flagged in Risks below.

### Decision 7 — `NoticesController` and `SessionAuthGuard` get the `.server.ts` suffix; DTOs do not

The roadmap's literal file list omits the suffix (`NoticesController.ts`). Every other file
already wired into the Nest DI graph in this codebase uses `.server.ts`
(`CoreModule.server.ts`, `DomainErrorFilter.server.ts`, `NoticesModule.server.ts`,
`DrizzleNoticeRepository.server.ts`, `DrizzleProvider.server.ts`) — a 100% consistent existing
pattern, because these files transitively import server-only modules (`~/db.server`,
`~/utils/session`). `NoticesController` and `SessionAuthGuard` both import `~/utils/session`
transitively, so they follow the same convention:
`app/domains/notices/presentation/NoticesController.server.ts` and
`app/domains/notices/presentation/guards/SessionAuthGuard.server.ts`. The three zod DTO files
(`CreateNoticeRequest.ts`, `UpdateNoticeRequest.ts`, `NoticeIdParam.ts`) contain no server-only
imports — pure zod schemas, like `NoticeDto.ts` — so they keep the roadmap's unsuffixed names.

### Decision 8 — `UpdateNoticeUseCase` and `DeleteNoticeUseCase` follow the fetch-then-mutate

pattern already established by `GetNoticeByIdUseCase`

```ts
// UpdateNotice.ts
export interface UpdateNoticeCommand {
  id: string; tenantId: string;
  titleJson?: LocaleMap; bodyJson?: LocaleMap | null; isPublished?: boolean;
}
export class UpdateNoticeUseCase {
  constructor(private logger: ILogger, private noticeRepository: INoticeRepository) {}
  async execute(command: UpdateNoticeCommand): Promise<NoticeDto> { ... }
}
```

Fetches the existing notice via `findById` (re-throwing `NotFoundError` as `NoticeNotFoundError`
— imported from the shared `app/domains/notices/application/errors/NoticeErrors.ts` (Decision 9)
— and re-running the same tenant-mismatch defence-in-depth check `GetNoticeByIdUseCase` already
does), merges the provided partial fields over the existing entity's props, re-validates via
`Notice.create()` (so the `titleJson` non-empty and `publishedAt`/`isPublished` invariants are
re-checked on every update, not just creation), sets `updatedAt = new Date()`, and calls `save()`
(upsert). Any `ValidationError` from `Notice.create()` propagates unmodified, exactly like
`CreateNoticeUseCase`.

**`publishedAt` transition rule (`UpdateNoticeCommand` intentionally has no `publishedAt` field
— it is derived, never client-supplied, exactly like `CreateNoticeUseCase`)**:

```ts
const wasPublished = existing.isPublished;
const willBePublished = command.isPublished ?? existing.isPublished;
const publishedAt =
	willBePublished && !wasPublished
		? now // first transition to published — stamp it
		: willBePublished
			? existing.publishedAt // already published, staying published — do not bump
			: null; // not published — Notice.create()'s own invariant requires null
```

Without this rule, a `PUT` that flips a draft to `isPublished: true` would silently leave
`publishedAt` at `null` forever — not a domain-invariant violation (`Notice.create()` already
permits `isPublished: true` with `publishedAt: null` for pre-tracking data), but a real product
gap: the API would have no way to record when a notice was actually published. Symmetrically, an
update that unpublishes an already-published notice must clear `publishedAt` back to `null` —
`Notice.create()` rejects `isPublished: false` with a non-null `publishedAt`, so this is not
optional, it is enforced by the entity itself; the use case must compute the correct value
_before_ calling `Notice.create()` rather than relying on the entity to reject a bad merge.

`DeleteNoticeUseCase` fetches via `findById` for the same tenant-isolation check, then calls
`INoticeRepository.delete(id, tenantId)`, logs `notice.deleted`, returns `void`. Re-fetching
before deleting (rather than trusting the repository's own tenant-scoped `WHERE`) is
deliberate defence-in-depth, matching `GetNoticeByIdUseCase`'s stated rationale ("guards against
a misconfigured or future adapter").

**Alternative considered for Update**: a full-replacement command (all fields required, like
`CreateNoticeCommand`) instead of a partial one. Rejected — `PUT` here behaves as
"update-in-place" per the Pilot Complete Gate's wording ("valid body returns 200 + updated
NoticeDto"), and a partial command lets `NoticesController` accept a `Partial`-shaped
`UpdateNoticeRequest` zod schema without forcing API clients to resend unchanged fields.

### Decision 9 — `NoticeNotFoundError` is extracted to a shared errors file now, not deferred again

`GetNoticeById.ts` defines `NoticeNotFoundError` with an explicit comment: _"Collocated here
rather than in a shared errors file. If a second use case needs this type, extract it to
`app/domains/notices/application/errors/NoticeErrors.ts` at that point."_ `UpdateNoticeUseCase`
and `DeleteNoticeUseCase` are exactly that second and third use case. Importing the class
directly from a sibling use-case file (`GetNoticeById.ts`) instead of performing the extraction
that comment names would leave the debt unpaid at the precise point it was designed to be paid,
and creates an awkward use-case-to-use-case import.

`NoticeNotFoundError` moves verbatim to `app/domains/notices/application/errors/NoticeErrors.ts`.
`GetNoticeById.ts` imports it from there instead of defining it — no behavior change, confirmed
by running the existing `GetNoticeById.test.ts` unmodified (only its import path changes) before
and after the move. `UpdateNotice.ts` and `DeleteNotice.ts` import from the same shared location,
never from `GetNoticeById.ts`.

### Decision 10 — `resolveLocale()` parses Accept-Language as a real HTTP list, not a single tag

Found in code review (both an independent blind review and a self-review converged on this
independently): the first implementation validated the _entire raw header_ against a single-tag
BCP-47 regex. Real browsers never send a bare tag — Chrome sends `en-US,en;q=0.9`, Firefox
`en-US,en;q=0.5` — so every real browser request 400'd. Neither `resolveLocale.test.ts` nor
`NoticesController.test.ts` exercised this realistic input; every test case used a single tag
(`"fr"`, `"de"`, `"xx_yy!!"`), which is why it slipped through.

Fixed by parsing the header properly, still without implementing full RFC 4647 negotiation
(that remains out of scope — DELTA needs a single preferred tag, not weighted multi-locale
negotiation):

1. Split on `,`; for each entry, strip any trailing `;q=...` parameter and surrounding
   whitespace.
2. Treat a literal `*` entry (RFC 7231's "any language" wildcard) as skippable — it carries no
   useful preference information, and is not an error.
3. Validate each remaining entry against the existing BCP-47 pattern. If **any** entry fails
   syntax validation, throw `InvalidLocaleTagError` — a single genuinely malformed entry (not
   `*`, not comma/`q=`-list syntax) still indicates a malformed header, preserving the original
   `"xx_yy!!"` scenario's behavior.
4. Walk the validated entries **in header order** (no `q=`-weight sorting — the deliberate
   simplification above) looking for either an exact match in `supportedLocales`, or a
   primary-subtag match (`"en-US"` → `"en"`) when the full tag isn't directly supported. Return
   the first match found; only fall through to `userPreferredLocale` → `tenantDefaultLocale` →
   `"en"` if nothing in the list matches at all.

Primary-subtag folding (step 4) also closes a second gap the same review raised: without it,
`en-US` would never match a supported `en`, silently falling all the way through the chain even
though the client clearly wants English.

### Decision 11 — `SessionAuthGuard` also writes into the request-context ALS store, not only

onto the Express request

Found in code review: `PinoLogger.server.ts`'s `contextMixin()` enriches every log line from
`getRequestContext()` (`traceId`/`tenantId`/`userId`) — that mixin is the entire mechanism ADR-004
relies on for tenant/user log attribution. The guard was setting `request.tenantId`/
`request.userId` on the Express request object (for the controller to read) but never writing
into the ALS store, so every `notice.created`/`notice.updated`/etc. log line from this API
carried `tenantId: null, userId: null` — silently losing exactly the attribution ADR-004 exists
for. This directly contradicts what Decision 2 above already specified ("`ctx.tenantId`/
`ctx.userId` are populated by `SessionAuthGuard` itself") — the first implementation didn't
follow through on it.

Fix: immediately after resolving `tenantId`/`userSession` and before returning `true`,
`SessionAuthGuard.canActivate()` calls `getRequestContext()` and, when a store is present,
mutates `ctx.tenantId`/`ctx.userId` — the exact same "resolve then mutate the live store" pattern
the root `requestContextMiddleware` already uses (`app/middleware/requestContext.server.ts`).

### Decision 12 — `GET /notices` reuses the existing `parsePagination()` utility instead of a

hardcoded page/pageSize

Found in code review: `NoticesController.list()` hardcoded `{ page: 1, pageSize: 100 }` with no
query-param support at all, silently truncating any tenant with more than 100 notices. This
wasn't a scope decision — `app/domains/notices/presentation/parsePagination.ts` already exists
(page/pageSize parsing off a `URL`, capped at 100, safe defaults) and is already used by the
existing 5a web-channel route (`app/routes/$lang+/_authenticated+/notices+/_index.tsx`). The
controller simply didn't reuse it.

Fix: `list()` builds a `URL` from the Express request (`new URL(req.url, "http://localhost")`,
same construction pattern `SessionAuthGuard` already uses) and calls the existing
`parsePagination(url)` instead of hardcoding values — no new pagination logic, just wiring in
what already exists two files away.

### Decision 13 — `NoticesController` returns plain resources on success, no envelope (ADR-007)

Found in code review, and traced back to the spec itself, not only the implementation:
`specs/notices-controller/spec.md`'s original wording specified a `{ success: true, data }`
envelope for `GET /notices` (list) only; `GET /:id`, `POST`, and `PUT` were specified as
returning "the locale-resolved `NoticeDto`" with no envelope. So `list()` wrapped its response
while `getById`/`create`/`update` didn't — an inconsistency in its own right.

Resolving that inconsistency raised the real question: should any of these be wrapped at all?
Checked against the already-shipped Notices web channel (`_index.tsx`/`$id.tsx` loaders) — it
already returns use case results directly, no envelope, and only uses the `{ success: false,
error }` shape for thrown errors. That's also current mainstream REST convention (plain resource
on success, HTTP status as the signal; envelope only for errors). **ADR-007** formalizes this as
a rule for every presentation surface.

Fix: `list()` returns the bare `NoticeDto[]` directly, not `{ success: true, data: [...] }`.
`getById`, `create`, and `update` are unchanged — they already returned the bare `NoticeDto`,
which turns out to have been the correct shape all along. `remove` (`DELETE`) is unaffected —
`204 No Content` has no response body by definition.

### Decision 14 — OpenAPI docs completed with explicit decorators; auto-gen only covers request bodies

Found manually (Postman + browser): `/api/v2/docs-json` had empty `parameters`/`responses` for
every operation. Per `nestjs-zod`'s README, response schemas need an explicit
`@ApiOkResponse({type})` (never automatic), and path params aren't auto-generated either —
`NoticesController` had none of these decorators. Not a library defect, a gap in what was built.

**Resolved empirically (tasks.md 21.1), not assumed**: the existing "required field" spec
scenario implies request bodies _should_ auto-generate, but `requestBody` was missing entirely
for `POST /notices` — bigger than a missing decorator, and repo pins zod v3 (`nestjs-zod`'s v3
path is deprecated vs. its v4-native one), so a zod-version limitation was a real possibility.
Checked directly: a throwaway harness added `@ApiBody({type: CreateNoticeRequest})` to `create()`
alone and dumped the actual generated document. Result: `requestBody` and
`components.schemas.CreateNoticeRequest` (including a correct `required` array) are both fully
populated with the decorator present, and both entirely absent (`{}`) without it. **This is
decorators-only** — `@nestjs/swagger` never introspects `@Body()` parameter types for
`requestBody` generation, the same "needs an explicit decorator" pattern responses and params
already have (this section, above). Not a zod-v3/`nestjs-zod` limitation; no zod-v4 bump needed.

Fix: add `@ApiBody({type: CreateNoticeRequest})` / `@ApiBody({type: UpdateNoticeRequest})` to
`create()`/`update()`; a `NoticeResponseSchema` (zod + `createZodDto`) for the locale-resolved
response shape, referenced via `@ApiOkResponse`/`@ApiCreatedResponse` on every handler;
`@ApiParam({name:"id", type:String, format:"uuid"})` on `getById`/`update`/`remove`;
`@ApiCookieAuth()` on the controller + `DocumentBuilder.addCookieAuth()` in `mountOpenApiDocs()`.

Note: `@ApiCookieAuth()` documents the requirement; it can't make Swagger's "Try it out" accept
a pasted token — the session cookie is `httpOnly`, and browsers block JS from setting `Cookie`
directly. "Try it out" only works with an already-active browser session. A bearer-token model
(ADR-006 draft, deferred) is what would allow a pasted token — not fixable here.

### Decision 15 — Unmatched-route 404s get a `documentationUrl`; resource-not-found ones don't

Found manually: any invalid path under `/api/v2` 404s with no hint where the real API is.
Mirrors GitHub's REST API convention (`documentation_url` on every error). A redirect was
considered and rejected — it'd break non-browser clients expecting JSON.

Fix: `DomainErrorFilter`'s `HttpException` branch adds `documentationUrl` (built from the
request's own protocol/host, never hardcoded) only when `exception.getStatus() === 404`.
Resource-not-found cases are `DomainError`s handled by the other branch, so this only fires for
genuinely unmatched routes. Add a one-line comment on this branch: it's only safe because every
current controller models resource-not-found as a `DomainError` — a future controller throwing
a raw `NotFoundException` for a real resource would incorrectly get a docs link too.

### Decision 16 — OpenAPI documents error responses and pagination params; pickLocale gets a real fallback

Found in a second independent review pass, after Decision 14 already fixed success-side docs.

**Error responses undocumented**: the generated doc only ever showed success statuses
(200/201/204) — none of the 401/400/422/404 responses these endpoints actually produce. Fix:
add `@ApiUnauthorizedResponse`/`@ApiBadRequestResponse`/`@ApiUnprocessableEntityResponse`/
`@ApiNotFoundResponse` to each handler, matched to what it can actually return (e.g. `list()`
gets 401+400, `create()` gets 401+400+422, `getById`/`update`/`remove` get 401+400+404,
`update` also gets 422). Description-only (`@ApiResponse({status, description})`), not a full
typed schema — the ADR-003 `ErrorResponse` envelope is already documented in ADR-003 itself;
building a shared, typed error-response schema for Swagger across every future domain is a
separate, later concern, not redone ad hoc here.

**Pagination undocumented**: `list()` reads `page`/`pageSize` off the query string but the doc
showed `parameters: []`. Fix: `@ApiQuery({name:"page", required:false, type:Number})` and same
for `pageSize`.

**`pickLocale` real correctness bug**: `map[locale] ?? map["en"] ?? ""` — but `Notice.create()`
only guarantees a notice has *some* non-empty `titleJson` entry, not specifically `en`. A notice
authored only in `es`/`fr`, served to a request that resolves to `"en"` (the common no-header
case), silently returns `titleJson: ""` — a required response field, blank, no error. Fix: fall
back to the first non-empty entry in the map when neither the resolved locale nor `en` is
present, before falling back to `""` (which then only fires for `bodyJson`, which has no
non-empty-content invariant and is nullable anyway).

### Decision 17 — `titleJson`/`bodyJson` request keys are restricted to valid locale codes

Found via manual Postman testing: `CreateNoticeRequest`'s schema was `z.record(z.string(),
z.string())` — any string key was accepted, not just locale codes. A tester posted
`{"key_0": "...", "key_1": "..."}` (not locale codes); it was accepted (`201`), then the
response silently returned `key_0`'s value via the Decision-16 fallback (no `en` entry, no
resolved-locale entry, first non-empty value wins). Correct behavior for that input, but the
input itself should never have been accepted — a real integrator making the same mistake gets a
confusingly-resolved 201 instead of a clear 422.

Fix: both `CreateNoticeRequest` and `UpdateNoticeRequest` restrict `titleJson`/`bodyJson` keys
to `VALID_LANGUAGES` (`app/utils/lang.backend.ts`) via `z.record(z.enum(VALID_LANGUAGES), ...)`
instead of `z.record(z.string(), ...)`. An unrecognized key now fails validation → `422`,
consistent with every other body-shape error.

Also add realistic `examples` (via `@ApiBody({ examples })`, not zod-schema-level annotations —
more reliable given the zod-v3 conversion path's limitations already noted in Decision 14) using
actual locale keys (`en`/`fr`/`es`) so Swagger UI shows a correct shape to copy from, rather than
requiring a reader to already know the convention.

### Decision 18 — Notices content is single-locale: `title`/`body` text, not locale-map JSONB (ADR-008)

Came out of a design review after 5c was otherwise complete. Checked against DELTA's actual old
modules first, not assumed: `hazardousEventTable`/`disasterEventTable` (genuine admin-entered
records) store every free-text field as plain `text`, no translation mechanism at all. The
`zeroStrMap` JSONB-locale-map pattern is used only for DELTA's own centrally-curated reference
vocabulary (sectors, hazard types), never for admin-authored content. Notices' original JSONB
design copied the wrong precedent — it required an admin to type every supported language into
one notice at creation time, which no real admin does.

**New model**: a notice is authored in one language. If a tenant wants the same information in
another language, the admin publishes a second, independent notice. No fallback chain, no
locale-map, no resolution logic of any kind for content.

**Schema** (`app/drizzle/schema/noticesTable.ts`, new migration — the original 4a migration is
already on `dev`, so this is an `ALTER TABLE`, not an edit to history):
```
- title_json jsonb NOT NULL     →  + title text NOT NULL
- body_json  jsonb              →  + body  text
                                 →  + locale text NOT NULL
```
Notices has zero real data (synthetic pilot domain), so the migration drops the old columns
outright — no backfill needed.

**Domain** (`Notice.ts`): `title: string`, `body: string | null`, `locale: string`. Invariant
simplifies to "title is non-empty" — no more locale-map entry checking.

**Application layer**: `NoticeDto`, all five use cases, `INoticeRepository`/
`DrizzleNoticeRepository`'s row↔entity mapping all move from `titleJson`/`bodyJson: LocaleMap`
to `title`/`body: string`, `locale: string`. `UpdateNoticeCommand` gains an optional `locale`
field for symmetry with `title`/`body`, though changing a notice's language post-creation is
expected to be rare.

**REST API (5c)**: `CreateNoticeRequest`/`UpdateNoticeRequest` become plain `{title, body,
locale, isPublished}` — the whole locale-key-restriction problem (Decision 17) disappears, it
was only needed because the field used to be a map. `NoticesController` drops
`resolveLocaleForRequest()`, `pickLocale()`, `nonEmpty()`, `toLocaleResolved()`, and the
`InstanceSystemSettingRepository` import entirely — a response is just the notice's own fields,
no per-request resolution step. `NoticeResponseSchema` keeps the presentation-layer/application-layer
separation (still its own zod schema, not `NoticeDto` reused directly as the wire type) but its
shape simplifies to match.

**Web channel (5a/5b, already merged)**: `NoticeListPage.tsx`/`NoticeDetailPage.tsx` each had
their own local `resolveLocale(map, lang)` helper reading `data.titleJson`/`data.bodyJson`.
Both drop that helper and render `data.title`/`data.body` directly — leaving them on the old
`LocaleMap` type while the API moved to the new one was rejected; a Clean Architecture reference
domain shipping two different content models for the same entity is worse than the original
problem.

### Decision 19 — `nestjs-i18n` for API error-message strings (ADR-001, ADR-008)

ADR-001 already named this: "`nestjs-i18n` is adopted only when NestJS exposes external HTTP
endpoints" — true as of 3c/5c. Today, `SessionAuthGuard`/`DomainErrorFilter`/etc. return
hardcoded English strings ("Authentication required.", "Validation failed", "An unexpected
error occurred..."). This activates ADR-001's deferred clause rather than deciding something
new.

Verified against `nestjs-i18n`'s actual docs (not assumed): its loader expects
`<path>/<lang>/<file>.json` — which is exactly DELTA's existing `locales/{{lng}}/{{ns}}.json`
layout. `I18nModule.forRoot({ loaderOptions: { path: <repo>/locales/ } })` points at the *same*
files the web UI already uses via Weblate — no new translation system, no duplicated content.
Domain-specific strings go in the relevant `{{ns}}.json` (e.g. `notices.json`); strings shared
by every future domain's API ("Authentication required", "Validation failed") go in
`common.json`, which already exists for this purpose.

Injection is `I18nService.t(key, { lang })`. `nestjs-i18n` supports a custom locale resolver;
implementation should verify its exact interface against the installed package (not the docs
site, which was incomplete on this point) and wire it to the same Accept-Language chain
`resolveLocale()` already implements, rather than `nestjs-i18n`'s default header resolver, to
keep one resolution chain across the app.

### Decision 20 — `I18nModule`'s loader path is the literal `locales/` directory, despite sibling non-language folders

Verified empirically (tasks.md 27.16), not assumed: `locales/` also holds `app/`, `content/`,
and `api-cache/` — pre-existing directories unrelated to UI/API translation (`app`/`content`
hold per-language content-translation JSON via a different pipeline; `api-cache` holds a
~1.3MB unrelated data cache). `nestjs-i18n`'s `I18nAbstractLoader` (unlike the existing
`i18next-fs-backend` setup in `app/middleware/i18next.server.ts`, which lazily reads one
interpolated path per request) eagerly enumerates **every** directory under the configured
`path` at bootstrap and treats each as a candidate language.

Confirmed via a throwaway `I18nJsonLoader` instantiation against the real `locales/` directory:
all sibling files parse as valid JSON (no crash), the extra directories become harmless unused
"languages" (`translations.app`, `translations.content`, `translations["api-cache"]`) that
nothing ever requests — `AcceptLanguageI18nResolver` and every consumer only ever resolve
against `VALID_LANGUAGES`, which is exactly `en`/`fr` today. One-time parse cost measured at
~86ms per `I18nModule` bootstrap (once per `NestFactory.create`/`Test.createTestingModule`
compile of `CoreModule`, not per request) — accepted as negligible.

**Alternative considered**: point the loader at a narrower, dedicated sub-path containing only
language folders. Rejected — no such path exists without either moving `app/`/`content`/
`api-cache` (out of scope, unrelated feature directories) or duplicating `en`/`fr` translation
files into a new location (explicitly rejected by Decision 19's "no duplicated content").
Accepting the harmless over-read is the smaller deviation from the stated design.

### Decision 21 — Vite dev-mode reload robustness

Found via manual testing: editing a file while the API was live crashed `yarn dev` with
`EADDRINUSE`. Cause (traced to `vite/dist/node/module-runner.js`): a full reload re-executes
`init.server.tsx`, resetting its module-scoped `httpApp` while the old port-3001 listener stays
bound. Fix: stash the live app (and the in-flight bootstrap promise, since Windows chokidar
fires duplicate change events and reloads can overlap) on `globalThis`, which survives the
reload; close the orphan before rebinding.

Also fixed a related race this exposed: `entry.server.tsx` calls `initServer()`
fire-and-forget, so requests could hit the session store before `initCookieStorage()` ran.
`initServer()` is now memoized and `requestContextMiddleware` awaits it first.

Added `API_HTTP_SERVER_ENABLED` (default enabled) so a dev not working on the API can skip
`bootstrapHttpServer()` entirely — separate from the already-tracked eager-vs-lazy timing item.

### Decision 22 — `NotFoundError` gets a translation key; other DomainError subtypes don't

`SessionAuthGuard`'s 401 was already translating; `NoticeNotFoundError`'s message wasn't —
`DomainError` is framework-agnostic (ADR-003), so its message was a plain English string with
no translation attempt. Fix: `DomainError` gains an optional `i18nKey` (reuses the existing
`context` as interpolation args). `NotFoundError` sets `i18nKey = "common.error.not_found"`;
`DomainErrorFilter` translates via it, falling back to the original message otherwise. Verified
`{var}` interpolation syntax against nestjs-i18n's actual docs first (differs from the web UI's
`{{var}}` convention). Not extended to `ValidationError`/`ConflictError`: their messages are
free-form per throw site, not one reusable template — would mean auditing every throw site,
separate scope. Verified live: `fr` → `"Notice introuvable"`, `en` → `"Notice not found"`.

`audience` is not a translation candidate — same category as `isPublished`, a stable enum for
the client to render, not the API to pre-translate. Not shown in the web UI yet either.

### Decision 23 — Final regression fixes for Decision 21's reload changes

Found running `yarn test:run2` after Decision 21: two new test failures, plus a real bug the
tests exposed. `requestContext.test.ts` didn't mock `~/init.server`, so its new `await
initServer()` call attempted a real bootstrap — added the mock, matching the file's existing
per-dependency mocking style. `HttpServerBootstrap.test.ts`'s `vi.resetModules()` between tests
doesn't clear the `globalThis` stash (by design, it must survive a real module reload) — added
explicit `afterEach` cleanup. Along the way, found `initServer()`'s own `readyPromise` never
reset on rejection, unlike the two promises it wraps — a transient bootstrap failure would have
permanently wedged the app. Fixed to match the existing reset-on-catch pattern. `yarn test:run2`
confirms 438 passed, same 4 pre-existing failures.

## Risks / Trade-offs

- [Risk] `nestjs-zod`'s zod-v3 OpenAPI conversion path is documented as a "deprecated custom
  converter" (v4 is the primary target) → Mitigation: functional today, tracked as a follow-up
  to consider bumping `zod` to v4 repo-wide in a separate, dedicated intent — not blocking this
  pilot; the Swagger doc's correctness is verified by an integration test in this change, not
  assumed.
- [Risk] `SessionAuthGuard` is the first NestJS guard in the codebase — a bug here means every
  Notices REST endpoint is either wide open or entirely broken → Mitigation: integration tests
  cover missing cookie, invalid session, valid session, and cross-tenant access explicitly
  (tasks.md); no endpoint is added without a corresponding 401 test.
- [Risk] Request-context middleware registered via `NoticesModule.configure()` only covers
  `/notices*` routes — a future second NestJS controller (outside this pilot) will need to
  either repeat this middleware registration per-module or the pattern will need promoting to
  `CoreModule`-level global middleware → Mitigation: explicitly noted here as a decision to
  revisit once a second REST controller is proposed; not solved speculatively in this change.
- [Risk] `instanceSystemSettingsTable` may have zero rows for a tenant (nullable
  `countryAccountsId`, no NOT NULL constraint forcing one row per tenant) → Mitigation:
  `resolveLocale()`'s `tenantDefaultLocale` input is `string | null`; a missing settings row
  falls through to `"en"` exactly like the `user.preferredLocale` gap, no special-casing needed.
- [Risk] **Lost-update race in `UpdateNoticeUseCase`** (found in independent code review):
  `execute()` fetches the existing notice, merges fields in application memory, then calls
  `save()` — the upsert makes the _write_ atomic, but not the fetch-merge-write sequence as a
  whole. Two concurrent `PUT`s to the same `id` both read the same pre-image; whichever write
  lands second silently overwrites the first with no conflict detected. **Accepted as a
  documented pilot-scope limitation** — Notices is a low-traffic admin CMS resource, not a
  high-contention shared counter, and concurrent edits to the exact same notice by two different
  admins at the same instant is a low-probability scenario for this pilot. `ConflictError`
  already exists in the `DomainError` hierarchy (ADR-003) as the extension point for optimistic
  concurrency (e.g. an `updatedAt`/version precondition on `save()`) if and when a real usage
  pattern demands it — not built speculatively in this change.

## Migration Plan

**Superseded by Decision 18/20**: a real migration now exists —
`20260723090000_notices_single_locale_content.sql` drops `title_json`/`body_json`, adds
`title`/`body`/`locale`. No backfill (zero real data in this synthetic pilot domain). Deploy is
otherwise additive: new routes on an already-running NestJS HTTP server, new npm dependencies
(`nestjs-zod`, `@nestjs/swagger`, `nestjs-i18n`). Rollback is a schema-down migration plus a
plain code revert — no real data written by this change needs unwinding.

## Open Questions

- Whether `SwaggerModule.setup()`'s path is affected by `app.setGlobalPrefix("/api/v2")` in the
  installed `@nestjs/core` version — resolved empirically by an integration test (Decision 6),
  not assumed here.
- Whether a second REST controller (post-pilot) promotes the request-context middleware from
  `NoticesModule`-local to `CoreModule`-global — deferred, not this change's concern.
