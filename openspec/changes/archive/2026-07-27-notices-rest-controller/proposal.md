## Why

The Notices pilot has a working web channel (5a/5b: React Router routes rendering the
authenticated Notices list/detail pages) but no REST API. The NestJS HTTP server and global
`DomainErrorFilter` (3c) and `NoticesModule` with its three read/create use cases (4h) are
already merged and idle — no controller is registered on them yet. This change adds the fifth
and final piece of the pilot: a versioned REST surface (`/api/v2/notices`) with full CRUD,
proving the Clean Architecture stack works for an external API consumer, not just SSR routes.

## What Changes

- Add `UpdateNoticeUseCase` and `DeleteNoticeUseCase` in
  `app/domains/notices/application/use-cases/` — the two use cases Phase 4 did not scope.
  No repository or schema changes: `INoticeRepository.save()` / `.delete()` already exist
  (verified merged from 4b/4g). `UpdateNoticeUseCase` derives `publishedAt` rather than
  accepting it as input: a draft→published transition stamps the current time, a
  published→unpublished transition clears it, and an already-published notice that stays
  published keeps its original `publishedAt` unchanged.
- Extract `NoticeNotFoundError` out of `GetNoticeById.ts` into a shared
  `app/domains/notices/application/errors/NoticeErrors.ts` — `GetNoticeById.ts`'s own comment
  named this exact extraction point ("if a second use case needs this type"), and
  `UpdateNoticeUseCase`/`DeleteNoticeUseCase` are that second and third use case. No behavior
  change; `GetNoticeById.test.ts` is updated only for the new import path.
- Add `NoticesController` (`@Controller('notices')`) with five endpoints: `GET /`, `GET /:id`,
  `POST /`, `PUT /:id`, `DELETE /:id`, each delegating to its use case and returning
  locale-resolved `NoticeDto` fields.
- Add a new `SessionAuthGuard` (NestJS `CanActivate`) — **no NestJS auth guard exists in this
  codebase today**; all existing auth (`authLoaderWithPerm`) is Remix-loader-only. The guard
  reuses the existing cookie/session infrastructure (`getUserFromSession`,
  `getCountryAccountsIdFromSession`) rather than forking session-parsing logic, and throws
  Nest's built-in `UnauthorizedException` (401) on a missing/invalid session.
- Add a shared `resolveLocale()` utility in `app/shared/i18n/` implementing the
  Accept-Language → user.preferredLocale → tenant.defaultLocale → `"en"` chain from ADR-001,
  mirroring the existing `findLocale()` fallback behaviour in
  `app/middleware/i18next.server.ts` (including gracefully skipping `user.preferredLocale`,
  which is not yet a DB column).
- Add zod request/param schemas (`CreateNoticeRequest`, `UpdateNoticeRequest`, `NoticeIdParam`)
  wired through `nestjs-zod`'s `createZodDto` + `ZodValidationPipe` — **not**
  `class-validator`/`class-transformer` (neither is installed; zod is DELTA's established
  validation library, see `app/utils/geoValidation.ts`). Path-param validation (`:id` UUID)
  and body validation intentionally use different pipe configurations so that an invalid `:id`
  returns 400 while an invalid body returns 422 (matches the Pilot Complete Gate; `nestjs-zod`'s
  `ZodValidationPipe` defaults to 400 for both unless the body pipe's exception factory is
  overridden).
- Wire `@nestjs/swagger` + `nestjs-zod`'s OpenAPI post-processor so the same zod schemas
  generate the OpenAPI document: the interactive Swagger UI at `/api/v2/docs`, the raw
  document at the sibling `/api/v2/docs-json` (see design.md Decision 6). **Correction to the
  roadmap text**: the roadmap names `patchNestJsSwagger()`; that function does not exist in the
  currently installable `nestjs-zod` release (v5.x) — the correct, current integration point is
  `cleanupOpenApiDoc()`. Functionally identical intent, corrected API name.
- Update `NoticesModule` to register the controller, the guard, the two new use cases, and a
  module-scoped middleware that opens one `withRequestContext({ traceId })` scope per request
  reaching `/notices*` (mirroring the existing root `requestContextMiddleware` pattern) so the
  guard's session lookup and the handler's tenant/user context share the same request-scoped
  cache — opening the scope inside all five controller methods individually was considered and
  rejected (see design.md).
- Add new dependencies: `nestjs-zod`, `@nestjs/swagger` (zod itself is already a dependency).

**Content model redesign (ADR-008, design.md Decision 18 — full scope, schema through web
channel).** Checked against DELTA's actual old modules: admin-entered records
(`hazardousEventTable`/`disasterEventTable`) never translate free-text fields; the
JSONB-locale-map pattern is only ever used for DELTA's own curated reference vocabulary. Notices'
original `titleJson`/`bodyJson: LocaleMap` design copied the wrong precedent, requiring an admin
to type every language into one notice at creation. Replaced with plain `title`/`body: text` +
`locale: text` — single-locale per notice, no translation, no fallback logic. If a tenant wants
the same content in another language, the admin publishes a second, independent notice. This
touches the schema (new migration), `Notice` entity, all use cases, the repository, both
REST DTOs and the controller, and — since they share the same entity/DTO — the already-merged
web channel (`NoticeListPage.tsx`/`NoticeDetailPage.tsx`), which drop their own local
locale-map-resolution helpers.

**API error messages via `nestjs-i18n` (ADR-001, design.md Decision 19).** Activates ADR-001's
already-written, previously-deferred clause ("`nestjs-i18n` adopted only when NestJS exposes
external HTTP endpoints" — now true). `DomainErrorFilter`/`SessionAuthGuard`'s hardcoded English
error strings move to `I18nService.t()`, reading the *same* `locales/{{lng}}/{{ns}}.json` files
the web UI already uses via Weblate — no second translation system.

## Capabilities

### New Capabilities

- `notice-update`: `UpdateNoticeUseCase` — fetch-merge-validate-persist an existing notice,
  tenant-isolation enforced the same way as `GetNoticeByIdUseCase`.
- `notice-delete`: `DeleteNoticeUseCase` — tenant-scoped existence check then delete.
- `notices-controller`: the five HTTP endpoints on `NoticesController` — request routing,
  locale-resolved response mapping, and letting `DomainError`/`HttpException` propagate to the
  global filter (no local try/catch).
- `session-auth-guard`: `SessionAuthGuard` — extracts `tenantId`/`userId` from the existing
  cookie session for the NestJS HTTP surface; 401 on missing/invalid session.
- `locale-resolution`: `resolveLocale()` — Accept-Language parsing, invalid-tag 400, the
  4-step fallback chain, reusable by future domains' NestJS controllers.
- `openapi-docs-bootstrap`: OpenAPI document generation from the same zod schemas; interactive
  Swagger UI mounted at `/api/v2/docs`, raw document at `/api/v2/docs-json`.

### Modified Capabilities

- `notices-module-wiring`: `NoticesModule` now also registers `NoticesController`,
  `SessionAuthGuard`, `UpdateNoticeUseCase`, `DeleteNoticeUseCase`, and a request-context
  middleware applied to the controller's routes.

## Impact

**Files changed:**

- `app/domains/notices/application/errors/NoticeErrors.ts` (new — `NoticeNotFoundError`
  extracted from `GetNoticeById.ts`)
- `app/domains/notices/application/use-cases/GetNoticeById.ts` (modified — imports
  `NoticeNotFoundError` from the new shared location instead of defining it; no behavior change)
- `app/domains/notices/application/use-cases/GetNoticeById.test.ts` (modified — import path only)
- `app/domains/notices/application/use-cases/UpdateNotice.ts` (new)
- `app/domains/notices/application/use-cases/UpdateNotice.test.ts` (new)
- `app/domains/notices/application/use-cases/DeleteNotice.ts` (new)
- `app/domains/notices/application/use-cases/DeleteNotice.test.ts` (new)
- `app/domains/notices/presentation/NoticesController.server.ts` (new — `.server.ts` suffix
  added vs. the roadmap's literal path, matching the 100%-consistent convention already used
  by every other Nest-wired file: `CoreModule.server.ts`, `DomainErrorFilter.server.ts`,
  `NoticesModule.server.ts`, `DrizzleNoticeRepository.server.ts`, `DrizzleProvider.server.ts`)
- `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` (new)
- `app/domains/notices/presentation/dto/CreateNoticeRequest.ts` (new)
- `app/domains/notices/presentation/dto/UpdateNoticeRequest.ts` (new)
- `app/domains/notices/presentation/dto/NoticeIdParam.ts` (new)
- `app/shared/i18n/resolveLocale.ts` (new)
- `app/shared/i18n/resolveLocale.test.ts` (new)
- `app/domains/notices/infrastructure/NoticesModule.server.ts` (modified — add controller,
  guard, two use cases, request-context middleware)
- `app/init.server.tsx` (modified — `mountOpenApiDocs()` mounts the interactive Swagger UI at
  `/api/v2/docs` and the raw document at `/api/v2/docs-json`, called from
  `bootstrapHttpServer()` after `app.setGlobalPrefix("/api/v2")` and before `app.listen()`)
- `app/infrastructure/RequestContextMiddleware.server.ts` (new — extracted out of
  `NoticesModule.server.ts` so future NestJS modules can reuse the same per-request
  `withRequestContext` scope; see design.md Decision 2)
- `package.json` (modified — add `nestjs-zod`, `@nestjs/swagger`)
- `tests/integration/domains/notices/NoticesController.test.ts` (new — supertest, mirrors the
  existing `tests/integration/nestjs/DomainErrorFilter.test.ts` pattern)
- `tests/integration/domains/notices/routes/` unaffected — the web channel (5a/5b) is untouched

**Fixes from code review (both an independent blind review and self-review), applied before
archive — see design.md Decisions 10–13:**
- `app/shared/i18n/resolveLocale.ts` (fixed — parses `Accept-Language` as a real comma-separated,
  `q`-weighted HTTP list with primary-subtag folding, not a single bare tag; the original
  implementation 400'd on every real browser's default header)
- `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` (fixed — now also writes
  `tenantId`/`userId` into the request-context ALS store, not only onto the Express request, so
  ADR-004 structured logs carry correct tenant/user attribution)
- `app/domains/notices/presentation/NoticesController.server.ts` (fixed — `list()` now uses the
  existing `parsePagination()` utility instead of a hardcoded `{ page: 1, pageSize: 100 }`;
  `list()` also now returns the bare `NoticeDto[]` array, matching `getById`/`create`/`update`,
  per new ADR-007)
- `_docs/decisions/ADR-007-success-response-shape.md` (new) — formalizes "plain resource on
  success, no envelope" for every presentation surface, citing the already-shipped Notices web
  channel as the reference implementation; `_docs/decisions/README.md` index updated
- Swagger docs (`/api/v2/docs`, `/api/v2/docs-json`) remain intentionally unauthenticated —
  raised in review, resolved as a deliberate choice (DELTA is open-source, the schema itself
  isn't sensitive; every data-bearing endpoint still requires `SessionAuthGuard`), not changed

**DB migration:** **Superseded by the Decision 18 content redesign below** — a real migration
now exists (`20260723090000_notices_single_locale_content.sql`). At the time this line was
originally written (before the redesign), `noticesTable`/`INoticeRepository.save()`/`.delete()`
already existed and no migration was needed for the REST-controller work alone.

**Files changed for the Decision 18/19 content redesign and nestjs-i18n wiring (this session,
full scope — schema through web channel):**
- `app/drizzle/migrations/20260723090000_notices_single_locale_content.sql` (new) +
  `app/drizzle/migrations/meta/_journal.json` (modified)
- `app/drizzle/schema/noticesTable.ts` (modified — `title_json`/`body_json` jsonb →
  `title`/`body`/`locale` text)
- `app/domains/notices/domain/Notice.ts` (modified — `title`/`body`/`locale`, drops `LocaleMap`)
- `app/domains/notices/application/dto/NoticeDto.ts`,
  `app/domains/notices/application/use-cases/{CreateNotice,UpdateNotice,ListNotices}.ts`
  (modified for the new fields; `GetNoticeById.ts`/`DeleteNotice.ts` unaffected — neither
  touches title/body directly)
- `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts` (modified — row↔entity
  mapping)
- `app/domains/notices/presentation/dto/{CreateNoticeRequest,UpdateNoticeRequest,NoticeResponseSchema}.ts`
  (modified — plain `{title, body, locale, isPublished}`, Decision 17's locale-key restriction
  is now moot)
- `app/domains/notices/presentation/NoticesController.server.ts` (modified — deleted
  `resolveLocaleForRequest()`/`pickLocale()`/`nonEmpty()`/`toLocaleResolved()` and the
  `InstanceSystemSettingRepository` import entirely)
- `app/domains/notices/presentation/{NoticeListPage.tsx,NoticeDetailPage.tsx}` (modified —
  deleted their local `resolveLocale(map, lang)` helpers, render `data.title`/`data.body`
  directly)
- `app/shared/i18n/AcceptLanguageI18nResolver.server.ts` (new) — `nestjs-i18n` custom resolver
- `app/infrastructure/CoreModule.server.ts` (modified — `I18nModule.forRoot()` added)
- `app/infrastructure/DomainErrorFilter.server.ts`,
  `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` (modified — resolve
  their own hardcoded message strings via `I18nService.t()`, `@Optional()`-injected)
- `locales/{en,fr}/common.json` (modified — new `error.authentication_required` key)
- `package.json`/`yarn.lock` (modified — add `nestjs-i18n`)
- Test files updated/added to match throughout `app/domains/notices/`,
  `tests/integration/domains/notices/`, `tests/integration/db/queries/`,
  `tests/unit/domains/notices/`, and `tests/e2e/notices/notices.spec.ts` (seed data field names).

**Test approach:** PGlite integration (`yarn test:run2`) via NestJS `Test.createTestingModule`

- `supertest`, following the established pattern in
  `tests/integration/nestjs/DomainErrorFilter.test.ts` and
  `tests/integration/domains/notices/NoticesModule.test.ts`. Unit tests (mock repository +
  `NoOpLogger`) for the two new use cases, following `CreateNotice.test.ts`'s pattern. No E2E
  required — this is a non-UI REST surface; Playwright already covers the web channel separately.

**Security / multi-tenancy:** security-sensitive. This is the first NestJS `CanActivate` guard
in the codebase and the first NestJS endpoint requiring authentication — get the guard wrong
and every endpoint is either open or broken. Every use case call is scoped by `tenantId`
extracted from the guard, never from a client-supplied field. `GetNoticeById`/`UpdateNotice`/
`DeleteNotice` reuse the existing tenant-isolation defence-in-depth check (compare the fetched
entity's `tenantId` to the request's `tenantId`, not just trust the repository's `WHERE` scope).
