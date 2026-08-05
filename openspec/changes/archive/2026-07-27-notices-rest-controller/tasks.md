## 1. Dependencies

- [x] Added `nestjs-zod` + `@nestjs/swagger`; peer deps resolved; `yarn tsc` clean.

## 2. Shared locale-resolution utility

- [x] `app/shared/i18n/resolveLocale.ts` (+ test) — pure function implementing the ADR-001
      fallback chain (Accept-Language → userPreferredLocale → tenantDefaultLocale → `"en"`),
      BCP-47 syntax check, throws `InvalidLocaleTagError` on invalid tags (design.md Decisions
      3–4; revised from the original `BadRequestException` in Section 19).

## 3. Extract NoticeNotFoundError (prerequisite refactor)

- [x] Moved `NoticeNotFoundError` to `app/domains/notices/application/errors/NoticeErrors.ts`;
      `GetNoticeById.ts` imports it from there. No behavior change (design.md Decision 9).

## 4. UpdateNoticeUseCase

- [x] `app/domains/notices/application/use-cases/UpdateNotice.ts` (+ test) — partial-field
      merge, `publishedAt` transition rule, tenant/nonexistent-id → `NoticeNotFoundError`
      (design.md Decision 8).

## 5. DeleteNoticeUseCase

- [x] `app/domains/notices/application/use-cases/DeleteNotice.ts` (+ test) — same
      tenant/not-found guard pattern as Update (design.md Decision 8).

## 6. Zod request/param DTOs

- [x] `NoticeIdParam`, `CreateNoticeRequest`, `UpdateNoticeRequest` under
      `app/domains/notices/presentation/dto/` — zod schemas wrapped in `createZodDto()`
      (design.md Decision 7). `yarn tsc` confirms inferred types match use-case commands.

## 7. SessionAuthGuard

- [x] `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` (+ integration test)
      — builds a Fetch `Request` from the Express request's `Cookie` header, delegates to
      `getUserFromSession()`/`getCountryAccountsIdFromSession()` unchanged, throws
      `UnauthorizedException` on any failure (design.md Decision 1).

## 8. NoticesModule wiring

- [x] `NoticesModule.server.ts` — registered `NoticesController`, `UpdateNoticeUseCase`/
      `DeleteNoticeUseCase` providers, `SessionAuthGuard` via `@UseGuards`, and
      `NestModule.configure()` for the request-context middleware (design.md Decision 2).

## 9. NoticesController

- [x] `app/domains/notices/presentation/NoticesController.server.ts` (+ integration test) —
      five routes (list/get/create/update/delete) per design.md Decisions 5–6: locale
      resolution, two `ZodValidationPipe` configs (400 for `:id`, 422 for bodies), no local
      try/catch (errors propagate to `DomainErrorFilter`).

## 10. OpenAPI / Swagger bootstrap

- [x] `init.server.tsx`'s `bootstrapHttpServer()` mounts `SwaggerModule` (via
      `nestjs-zod`'s `cleanupOpenApiDoc()`) at `/api/v2/docs` (interactive UI) with the raw
      document at the default `/api/v2/docs-json` sibling path (design.md Decision 6).

## 11. Quality gates (first pass)

- [x] Gates 1–9 all green. Gate 9 (visual/UX parity) not applicable — no presentation-layer
      files in this change.

## 12. Regression (first pass)

- [x] `yarn test:run2` — 391 passed, 4 pre-existing failures (baseline vs. `5d3d0a87`). One
      regression found & fixed: `HttpServerBootstrap.test.ts` needed `@nestjs/swagger`'s
      `SwaggerModule` and `nestjs-zod`'s `cleanupOpenApiDoc` mocked for the new
      `mountOpenApiDocs()` call.

## 13. Fix: resolveLocale parses Accept-Language as a real HTTP list

Found in code review (design.md Decision 10) — real browsers send comma-separated, q-weighted
lists (`"en-US,en;q=0.9"`), not a single bare tag; every real request 400'd.

- [x] Rewrote `resolveLocale()`'s Accept-Language handling: split on `,`, strip `;q=...`,
      skip `*` wildcards, validate remaining entries, walk in header order with primary-subtag
      folding (`"en-US"` → `"en"`). Added multi-value/folding/wildcard/malformed-entry cases to
      `resolveLocale.test.ts` and a realistic-header case to `NoticesController.test.ts`.

## 14. Fix: SessionAuthGuard writes tenantId/userId into the request-context store

Found in code review (design.md Decision 11) — `PinoLogger`'s `contextMixin()` reads only from
the ALS store; the guard set `request.tenantId`/`userId` but never wrote into that store, so
every log line during a Notices API request carried `tenantId: null, userId: null`.

- [x] `SessionAuthGuard.server.ts` now calls `getRequestContext()` and mutates
      `ctx.tenantId`/`ctx.userId` after resolving the session. Added a guard-level test plus an
      end-to-end `NoticesController.test.ts` test capturing an actual log line via
      `__getBasePinoInstanceForTest()` to confirm the ADR-004 gap is closed, not just the guard
      in isolation.

## 15. Fix: GET /notices supports page/pageSize query parameters

Found in code review (design.md Decision 12) — `list()` hardcoded `{page:1, pageSize:100}`,
ignoring the existing `parsePagination()` utility already used by the 5a web-channel route.

- [x] `list()` now builds a `URL` from the request and calls `parsePagination(url)`. Added
      default/explicit/clamped-pageSize cases to `NoticesController.test.ts`.

## 16. Fix: NoticesController success responses are plain resources (ADR-007)

Found in code review, resolved via new ADR-007 (design.md Decision 13) — `list()` wrapped its
response in `{success, data}` while `getById`/`create`/`update` already returned bare
`NoticeDto`s; checked against the shipped Notices web-channel loaders, which already return
bare results. Standardized on "plain resource on success, no envelope."

- [x] `list()` returns the bare `NoticeDto[]` array. Updated `NoticesController.test.ts`
      assertions accordingly. Confirmed `ADR-007-success-response-shape.md` is present and
      indexed in `_docs/decisions/README.md`.

## 17. Test-completeness pass

- [x] Reviewed `resolveLocale.test.ts`, `NoticesController.test.ts`, `SessionAuthGuard.test.ts`
      for gaps beyond sections 13–16. Added: empty/whitespace-only Accept-Language (falls
      through gracefully), `pageSize=0` (falls back to default 20 — falsy in
      `parsePagination()`'s `|| 20`), `page=-1` (clamps to 1), uppercase-cased `:id` (validates
      — zod's `.uuid()` is case-insensitive, Postgres `uuid` normalizes case). No gap found in
      `SessionAuthGuard.test.ts` — existing 6 tests already cover the full spec.

## 18. Quality gates (second pass, post-fix)

- [x] Gate 1 — full target list (sections 2–17's files) green together, 100 tests/8 files.
      Found & fixed one artifact-drift regression: `NoticesModule.test.ts`'s concurrent-tenant
      test still read the pre-ADR-007 `resA.body.data` shape.
- [x] Gate 2 — `yarn tsc` clean.
- [x] Gate 3 — Prettier: formatted the 4 files this session's edits left unclean; repo-wide
      `format:check` still flags ~315 pre-existing files untouched by this change (confirmed via
      `git status` — not a regression).
- [x] Gate 4 — Anti-pattern review clean.
- [x] Gate 5 — SOLID review (`solid-reviewer` agent), two findings: 1. **Not acted on at the time**: `resolveLocale()` throwing NestJS's `BadRequestException`
      directly is pre-existing (Section 2) and an explicit, considered design.md Decision 4
      choice — changing it would be a design deviation requiring user approval. Flagged to
      the user, not changed then; approved and actioned later (Section 19). 2. **Fixed**: the "resolve then mutate the ALS store" logic was duplicated between
      `SessionAuthGuard.server.ts` and `app/middleware/requestContext.server.ts`. Extracted
      `writeSessionIntoContext()` into `app/utils/requestContext.server.ts`; both call sites
      now use it. All affected tests re-confirmed green.
- [x] Gate 6 — Documentation review clean (WHY-focused, low comment-to-code ratio).
- [x] Gate 7 — Project conventions clean.
- [x] Gate 8 — Code review found one gap: no integration-level test confirmed
      `resolveLocale()`'s thrown error reaches the client as `400` via `DomainErrorFilter` (only
      unit-tested in isolation). Fixed: added a malformed-header case to
      `NoticesController.test.ts`; confirmed green.
- [x] Gate 9 — not applicable (no presentation-layer files touched).

## 19. Design deviation: `InvalidLocaleTagError` replaces `BadRequestException` (approved 2026-07-22)

Revisits the Gate 5 finding above. `resolveLocale()` now throws a framework-agnostic
`InvalidLocaleTagError` (own `Error` subtype, `code`/`supportedLocales` fields, no
`@nestjs/common` import) instead of `BadRequestException` — closes the SOLID/DIP gap without
changing observable HTTP behavior. See design.md Decision 4 for the full rationale.

- [x] `InvalidLocaleTagError` defined in `app/shared/i18n/resolveLocale.ts`; `resolveLocale()`
      throws it in place of `BadRequestException`.
- [x] `DomainErrorFilter.server.ts` — dedicated `instanceof InvalidLocaleTagError` branch, 400,
      same ADR-003 envelope shape.
- [x] `design.md` Decision 4 and `specs/locale-resolution/spec.md` updated to describe
      `InvalidLocaleTagError` instead of `BadRequestException`.
- [x] Updated `resolveLocale.test.ts`, `DomainErrorFilter.test.ts` (new coverage for the
      dedicated branch), and `NoticesController.test.ts`'s comment; all green, `yarn tsc` clean.
- [x] **Considered, not acted on**: Gate 8 flagged making `InvalidLocaleTagError extends
DomainError` instead of `Error` (DIP/OCP). Declined, approved 2026-07-22 — semantic, not
      coupling: a malformed header is request-shape, not "the domain speaking" (design.md
      Decision 4), same bucket as a bad `:id` param already handled outside the `DomainError`
      branch.
- [x] **Considered, not acted on**: independent review (2026-07-22) flagged `SessionAuthGuard`
      using `Promise.all` where `requestContext.server.ts` deliberately uses `allSettled`.
      Declined — a genuine DB failure during session lookup should surface as 500 (a real server
      error), not be silently converted to 401 the way the root middleware's `allSettled`
      swallows failures for a different reason (not crashing an unrelated page load). Not a bug.

## 20. Regression (second pass, post-fix)

- [x] 20.1 `yarn test:run2` — 409 passed, 4 failed. Same 4 failures reproduced on base commit
      `5d3d0a87` (verified in an isolated worktree, not assumed). No regression.

## 21. Fix: OpenAPI documentation completeness (design.md Decision 14)

Found via manual verification (Postman + browser) — `/api/v2/docs-json` had empty
`parameters`/`responses`/`components.schemas` for every operation.

- [x] 21.1 Diagnose the missing `requestBody` first: add `@ApiBody({type: CreateNoticeRequest})`
      to `create()` alone, regenerate the doc via the test harness, inspect the real JSON.
      Record whether that alone populates `requestBody`, or the zod-v3 path just can't produce
      one — determines whether the rest of this section is decorators-only or needs a flagged
      zod-v4-bump follow-up.
      **Finding**: `@ApiBody({type: CreateNoticeRequest})` alone fully populates `requestBody`
      — confirmed via a throwaway harness dumping the real generated document. Without the
      decorator, `requestBody` and `components.schemas` are both entirely absent (empty `{}`).
      With it, `requestBody.content["application/json"].schema` is a `$ref` to
      `CreateNoticeRequest` and `components.schemas.CreateNoticeRequest.required` correctly
      lists `["titleJson", "bodyJson", "isPublished"]` — the zod v3 `createZodDto()` schema
      converts to OpenAPI correctly. This is **decorators-only**: `@nestjs/swagger` never
      introspects `@Body()` parameter types for `requestBody` generation (same pattern as
      responses/params needing explicit decorators per Decision 14) — not a zod-v3/nestjs-zod
      limitation. No zod-v4 bump needed; task 21.8's fallback does not apply.
- [x] 21.2 Add failing tests to `OpenApiDocs.test.ts` per the updated
      `specs/openapi-docs-bootstrap/spec.md`: `id` param documented on GET/PUT/DELETE; `201`
      response has a non-empty schema; every operation has a non-empty `security` array; rewrite
      the "required field" test to read actual `requestBody` content, not just check a key exists
- [x] 21.3 Confirm Red — 4 of 7 tests failed for the expected reason (`undefined` where a
      populated field was expected); 3 pre-existing tests stayed green.
- [x] 21.4 Add `NoticeResponseSchema` (zod + `createZodDto`, mirrors `toLocaleResolved()`'s
      output); reference via `@ApiOkResponse`/`@ApiCreatedResponse` (array-typed for `list()`) on
      every handler
- [x] 21.5 Add `@ApiParam({name:"id", type:String, format:"uuid"})` to `getById`/`update`/`remove`
- [x] 21.6 Add `@ApiCookieAuth()` to the controller + `DocumentBuilder.addCookieAuth("__session",
{type:"apiKey", in:"cookie", name:"__session"})` in `mountOpenApiDocs()`
- [x] 21.7 Confirm Green; refactor, re-confirm Green — all 7 `OpenApiDocs.test.ts` tests pass.
- [x] 21.8 N/A — 21.1 found `requestBody` **is** fixed by `@ApiBody()` alone (decorators-only
      gap); no zod-v4-bump follow-up needed, nothing to flag in `design.md`'s Risks beyond the
      pre-existing general zod-v3-conversion-path risk already noted there.

## 22. Fix: unmatched-route 404s include a documentationUrl (design.md Decision 15)

- [x] 22.1 Add a failing test per the updated `specs/notices-controller/spec.md`: an unmatched
      `/api/v2` path returns `404` + `documentationUrl`; a `NoticeNotFoundError` 404 does not
- [x] 22.2 Confirm Red — new unmatched-route test failed (`documentationUrl` undefined); the
      resource-not-found counterpart passed already (no regression risk there).
- [x] 22.3 In `DomainErrorFilter.server.ts`'s `HttpException` branch, when
      `exception.getStatus() === 404`, add `documentationUrl` built from the request's own
      protocol/host (via `ctx.getRequest()`, structurally typed like the rest of this file) —
      never hardcoded
- [x] 22.4 Confirm Green; refactor, re-confirm Green — all 25 `DomainErrorFilter.test.ts` tests
      pass.

## 23. Quality gates + regression (third pass, post-OpenAPI-fix)

- [x] 23.1 Gate 1 — full target test-file list (sections 2–22's files) green together — 114
      tests/7 files.
- [x] 23.2 Gate 2 — `yarn tsc` clean.
- [x] 23.3 Gate 3 — `yarn format:check` clean on every touched file (repo-wide pre-existing
      count unaffected).
- [x] 23.4 Gate 4 — Anti-pattern review clean.
- [x] 23.5 Gate 5 — SOLID review (`solid-reviewer` agent) against files changed in sections
      21–22, three findings, all fixed: (1) `documentationUrl`'s `/api/v2/docs` literal
      duplicated the path `mountOpenApiDocs()` (`app/init.server.tsx`) actually mounts, with
      nothing keeping them in sync — extracted `app/shared/openApiDocsPath.ts`
      (`API_GLOBAL_PREFIX`/`OPENAPI_DOCS_SUBPATH`/`OPENAPI_DOCS_PATH`), both call sites now
      import it. (2) the `:id` `@ApiParam` was repeated verbatim on `getById`/`update`/`remove`
      — extracted `ApiNoticeIdParam()` (`NoticeIdParam.ts`, via `applyDecorators`), all three
      call sites use it. (3) `NoticeResponseSchema` (doc-only zod) and the controller's
      hand-written `LocaleResolvedNoticeDto` interface described the same shape from two
      independent definitions — removed the interface; the controller now imports
      `LocaleResolvedNoticeDto` as `z.infer<typeof noticeResponseSchema>`, one definition drives
      both the docs and the real return type.
- [x] 23.6 Gate 6 — Documentation review clean (WHY-focused comments, no restated code).
- [x] 23.7 Gate 7 — Project conventions review clean (DTO files correctly keep no `.server`
      suffix per Decision 7 — no server-only imports added).
- [x] 23.8 Gate 8 — Code review over the complete diff, including sections 21–22. Two findings,
      both fixed: an untested speculative `allOf`-fallback branch in the new requestBody test
      (simplified to the single shape empirically confirmed in 21.1); `ApiNoticeIdParam()`'s
      `MethodDecorator & ClassDecorator` return-type annotation didn't match
      `applyDecorators()`'s actual generic signature (removed, left to inference).
- [x] 23.9 Gate 9 — not applicable. This session's changes are OpenAPI documentation metadata
      and an error-response field, not rendered output — no `app/routes/` or UI
      presentation-layer files touched.
- [x] 23.10 `yarn test:run2` — 415 passed, 4 failed. Same 4 failures as the section-20
      baseline by identity (`mcp.test.ts`, `approvalStatusWorkflowService.test.ts`,
      `entityValidationAssignmentRepository.test.ts` x2) — unrelated to any file this session
      touched. 409 → 415 passed matches the 6 tests added this session. No regression.

## 24. Fix: OpenAPI error/pagination docs, and a real pickLocale bug (design.md Decision 16)

Found in a second independent review pass.

- [x] 24.1 Add a failing test to `resolveLocale`'s locale-mapping tests (or a new small unit
      test file for the mapping helper) per the updated `specs/notices-controller/spec.md`: a
      `titleJson` with no `en` entry (e.g. `{es: "Aviso"}`) resolved against `"en"` returns
      `"Aviso"`, not `""`
- [x] 24.2 Confirm Red
- [x] 24.3 Fix `NoticesController.server.ts`'s locale-mapping (currently `map[locale] ??
map["en"] ?? ""`): fall back to the first non-empty entry in the map before `""`
- [x] 24.4 Confirm Green
- [x] 24.5 Add failing tests to `OpenApiDocs.test.ts` per the updated
      `specs/openapi-docs-bootstrap/spec.md`: every operation documents `401`;
      `getById`/`update`/`remove` document `404`; `create`/`update` document `422`;
      locale-resolving operations document `400`; `GET /notices` documents `page`/`pageSize` as
      optional query params
- [x] 24.6 Confirm Red
- [x] 24.7 Add `@ApiUnauthorizedResponse`/`@ApiBadRequestResponse`/
      `@ApiUnprocessableEntityResponse`/`@ApiNotFoundResponse` (description-only, no typed
      schema) to each handler per Decision 16's mapping; add `@ApiQuery` for `page`/`pageSize`
      on `list()`
- [x] 24.8 Confirm Green; refactor, re-confirm Green. Hoisted the repeated
      `@ApiUnauthorizedResponse` to the class decorator; reworded its description to
      `"Authentication required."` (was mechanism-specific).
- [x] 24.9 Added the `DomainErrorFilter` 404-branch comment as specified. Considered narrowing
      the check itself; declined as over-engineering for one controller.
- [x] 24.10a Gate 8 found a second variant of the same bug (empty-but-present `"en"` entry).
      Fixed `pickLocale()` to check content, not key presence. Green, 32/32 tests.
- [x] 24.10 Gates 1–9 green (9 N/A, no rendered output). `yarn test:run2` — 422 passed, same 4
      pre-existing failures as the 415-passed baseline. No regression.

## 25. Fix: restrict titleJson/bodyJson keys to valid locale codes (design.md Decision 17)

Found via manual Postman testing.

- [x] 25.1 Add failing tests per the updated `specs/notices-controller/spec.md` and to
      `CreateNoticeRequest`/`UpdateNoticeRequest`'s own schema tests if any exist: a non-locale
      key (e.g. `"key_0"`) is rejected; valid locale keys (`"en"`, `"fr"`) are accepted
- [x] 25.2 Confirm Red
- [x] 25.3 Update `CreateNoticeRequest.ts` and `UpdateNoticeRequest.ts`: change
      `titleJson`/`bodyJson`'s key type from `z.string()` to
      `z.enum(VALID_LANGUAGES as [string, ...string[]])` (import `VALID_LANGUAGES` from
      `~/utils/lang.backend`) — verified present in both files after the agent that made this
      change was interrupted mid-session; confirmed complete and correct, not partial
- [x] 25.4 Confirm Green
- [x] 25.5 Add realistic `examples` (real locale keys: `en`/`fr`/`es`) to the `@ApiBody`
      decorators on `create`/`update` in `NoticesController.server.ts`
- [x] 25.6 `yarn tsc` — clean
- [x] 25.7 `yarn test:run2` — 425 passed, same 4 pre-existing failures as prior baseline (was
      422/4). No regression; verified directly, not assumed, after the interrupting agent kill

## 27. Redesign: single-locale content, drop titleJson/bodyJson (design.md Decision 18, ADR-008)

Full scope — schema through web channel. Read design.md Decisions 18–19 and the revised
`specs/notices-controller/spec.md`/`specs/locale-resolution/spec.md` before starting.

**Schema + migration**
- [x] 27.1 New migration (`yarn dbsync` or hand-written, matching existing migration
      conventions): drop `title_json`/`body_json`, add `title text NOT NULL`, `body text`,
      `locale text NOT NULL`. Update `app/drizzle/schema/noticesTable.ts` to match. No backfill
      — zero real data.

**Domain (TDD)**
- [x] 27.2 Update `Notice.test.ts`: `title: string`, `body: string | null`, `locale: string`;
      invariant is just "title non-empty (trimmed)" — drop the locale-map entry check
- [x] 27.3 Confirm Red
- [x] 27.4 Update `Notice.ts` to match; drop the `LocaleMap` export if nothing else uses it
      (check first) — confirmed unused outside notices domain via repo-wide grep; removed.
- [x] 27.5 Confirm Green

**Application layer (TDD)**
- [x] 27.6 Update `NoticeDto`/`toNoticeDto()`, `CreateNotice`/`UpdateNotice`/`ListNotices`/
      `GetNoticeById`/`DeleteNotice` use cases and their tests for `title`/`body`/`locale`.
      `UpdateNoticeCommand` gains optional `locale`. `publishedAt` transition logic (Decision 8)
      unchanged.
- [x] 27.7 Update `DrizzleNoticeRepository`'s `toEntity()`/`save()` mapping and its integration
      tests for the new columns
- [x] 27.8 Confirm Green across all application-layer tests — 72/72 passed.

**REST DTOs + controller (TDD)**
- [x] 27.9 Update `CreateNoticeRequest`/`UpdateNoticeRequest`: `{ title, body, locale, isPublished }`
      — `locale: z.enum(VALID_LANGUAGES as [string, ...string[]])`, no more locale-map key
      restriction (Decision 17 is moot)
- [x] 27.10 Update `NoticeResponseSchema` to match; keep it a distinct zod schema from `NoticeDto`
      (presentation/application separation), just simplify its fields
- [x] 27.11 Update `NoticesController`: delete `resolveLocaleForRequest()`, `pickLocale()`,
      `nonEmpty()`, `toLocaleResolved()`, the `InstanceSystemSettingRepository` import; handlers
      return the notice's fields directly
- [x] 27.12 Update `NoticesController.test.ts` for the new request/response shapes; drop the
      locale-map/pickLocale-fallback tests entirely (behavior no longer exists)
- [x] 27.13 Confirm Green — 30/30 passed.
- [x] 27.13a Collateral fix (found running the full notices test dir, not deferred to 27.24):
      `OpenApiDocs.test.ts` had two tests written against the old shape/behavior —
      `"titleJson"` in the required-fields assertion, and a "locale-resolving operations
      document their 400" test asserting `GET /notices`/`POST /notices` document 400. Per
      `specs/openapi-docs-bootstrap/spec.md`'s already-revised text ("400 applies to
      getById/update/remove only ... not assumed to still produce a 400 the way content-locale
      resolution used to"), fixed both: required-field assertion now checks `"title"`; the 400
      test now asserts `:id` routes document 400 and list/create do not (no 400 source remains
      on those two operations). 12/12 green.

**nestjs-i18n wiring (TDD)**
- [x] 27.14 `yarn add nestjs-i18n` — installed `nestjs-i18n@10.8.5`.
- [x] 27.15 Verify its custom-resolver interface against the installed package's own types (not
      just docs, which were incomplete on this point) before implementing — read
      `i18n-language-resolver.interface.d.ts` directly: `I18nResolver.resolve(context:
      ExecutionContext): Promise<string|string[]|undefined> | string|string[]|undefined`.
      Also independently discovered (by reading `i18n.middleware.js`, not assumed) that
      `I18nMiddleware.use()` calls the resolver on **every** request with no try/catch — a
      throwing resolver would 500 every request, not just error paths. Confirmed this drove
      `AcceptLanguageI18nResolver`'s swallow-and-fall-through design below.
- [x] 27.16 Configure `I18nModule.forRoot()` (loader path → repo's `locales/` dir, matching the
      existing `<lang>/<ns>.json` layout) with a custom resolver wired to the same Accept-Language
      chain `resolveLocale()` implements. Verified empirically (throwaway `I18nJsonLoader`
      instantiation) that `locales/` has non-language sibling dirs (`app/`, `content/`,
      `api-cache/`, holding unrelated data) that nestjs-i18n's directory-enumerating loader
      picks up as bogus extra "languages" — confirmed harmless (valid JSON, ~86ms one-time
      parse, never selected since nothing requests them) rather than assumed; noted as a
      trade-off, not a design deviation, since it still satisfies "same files, no duplication."
- [x] 27.17 Add failing tests per the new `specs/notices-controller/spec.md` requirement: an
      error message resolves in the request's locale; falls back correctly with no
      `Accept-Language` — `tests/integration/domains/notices/I18nErrorMessages.test.ts`.
- [x] 27.18 Confirm Red — both tests failed with the pre-change literal `"Unauthorized"`.
- [x] 27.19 Wire `DomainErrorFilter`/`SessionAuthGuard` to `I18nService.t()` for their message
      strings, sourced from `locales/{{lng}}/common.json` (shared) or `notices.json`
      (domain-specific) as appropriate. `I18nService` injected via `@Optional()` in both — tests
      that wire either in isolation (without `CoreModule`/`I18nModule`) still pass, degrading to
      the same untranslated English default.
- [x] 27.20 Confirm Green — 2/2 passed.

**Web channel retrofit (already-merged 5a/5b)**
- [x] 27.21 Update `NoticeListPage.tsx`/`NoticeDetailPage.tsx`: delete their local
      `resolveLocale(map, lang)` helpers, render `data.title`/`data.body` directly
- [x] 27.22 Update/add tests for both pages against the new `NoticeDto` shape
- [x] 27.23 Confirm Green — 12/12 passed.

**Test-completeness pass**
- [x] 27.24 Review the full set of changed/new tests for gaps beyond what's listed above —
      document any genuine gap found or note why none exists, same discipline as prior passes.
      Found two: (1) `PUT /notices/:id` updating `locale` alone was only exercised at the
      use-case level (`UpdateNotice.test.ts`), not through the REST layer/`ZodValidationPipe`
      wiring — added `NoticesController.test.ts` coverage. (2) `POST /notices` with a missing
      `locale` field (now required per ADR-008) had no 422 coverage, only the
      unsupported-value case — added. Also re-confirmed (grep, not assumed): zero remaining
      `LocaleMap`/`titleJson`/`bodyJson` references anywhere under `app/` after this section's
      changes.

**Quality gates + regression**
- [x] 27.25 Full 9-gate re-run against every file this section touched:
  - Gate 1 — 256+17 tests across all section-27 test files green (final count, after the Gate 5
    refactor's new tests).
  - Gate 2 — `yarn tsc` clean.
  - Gate 3 — `yarn format:check` clean on every touched file.
  - Gate 4 — anti-pattern review clean.
  - Gate 5 — SOLID review (`solid-reviewer` agent). No DIP violations (only
    `DrizzleNoticeRepository.server.ts` touches Drizzle in the whole domain, verified by grep).
    Two SRP findings, both fixed (small, contained, both already exercised by existing tests so
    no behavior-change risk):
    1. `publishedAt` transition logic was duplicated (with drifting shapes) between
       `CreateNotice.ts`/`UpdateNotice.ts` — extracted `Notice.computePublishedAt()` (+ 4 new
       domain tests), both use cases now call it. `CreateNotice.test.ts`/`UpdateNotice.test.ts`
       still pass unmodified — confirms no behavior change.
    2. The fetch-then-tenant-recheck pattern was duplicated identically across
       `GetNoticeById`/`UpdateNotice`/`DeleteNotice` — extracted
       `app/domains/notices/application/fetchOwnedNotice.ts` (+ 4 new tests), all three use
       cases now call it. All three use cases' existing not-found/tenant-mismatch tests still
       pass unmodified.
    The three previously-accepted trade-offs (`I18nService` `@Optional()` fallback, swallowed
    `InvalidLocaleTagError`, dual `NoticeDto`/`NoticeResponseSchema` shapes) were re-verified
    against the current code and still hold. One test gap found independently while re-reading
    the controller: PUT lacked the tenantId-body-ignored test POST already had — added.
  - Gate 6 — documentation review: comments trimmed for length after user feedback mid-loop
    (`AcceptLanguageI18nResolver.server.ts`, `CoreModule.server.ts`,
    `I18nErrorMessages.test.ts`, one test comment) — all still WHY-focused, shorter.
  - Gate 7 — project conventions clean; fixed one artifact-drift item found in this pass:
    design.md's "Migration Plan" and proposal.md's "DB migration: none" both predated Decision
    18's real migration — both updated with a superseded note, not silently left contradictory.
  - Gate 8 — code review below.
  - Gate 9 — REQUIRED (touches `NoticeListPage.tsx`/`NoticeDetailPage.tsx`). Ran the real app
    (`yarn dev` equivalent against the local `delta-local-db` Postgres), applied the migration
    for real (found and fixed a real blocker: the local dev DB had 31 leftover manual-test
    notices rows from earlier Postman sessions, which the `title text NOT NULL` migration
    correctly rejected — cleared with explicit user approval, then re-seeded 11 realistic
    notices with variance: `en`/`fr`/`es`/`ar`/`zh`/`ru` locales, short/very-long titles,
    special characters, null bodies, published/draft mix). Created a temporary user tied to an
    existing tenant, logged in via the real `/en/user/login` form with Playwright, screenshotted
    `/en/notices` and `/en/notices/:id`. Compared against `/en/hazardous-event`'s list page
    (same `MainContainer`/pink-banner heading, same `DataTable`, same eye-icon view action) —
    matches. `NoticeDetailPage`'s `dts-heading-2` class confirmed used across 15 other
    detail/section pages, not a one-off. All locale content (including RTL Arabic) rendered
    correctly, long title wrapped, special characters (`<tags>`, quotes, `&`) rendered as text,
    not interpreted as HTML. Cleaned up: temp user deleted, temp Playwright script removed,
    seeded notices data kept (per explicit user request for post-migration re-seeding).
- [x] 27.26 `yarn test:run2` — first pass 430 passed/4 failed; after the Gate 5 SRP-refactor
      fixes above (which added `Notice.computePublishedAt()` and `fetchOwnedNotice()` plus 8 new
      tests), re-ran: **438 passed, 4 failed.** Same 4 failures by identity as every prior
      baseline in this change (`mcp.test.ts`, `approvalStatusWorkflowService.test.ts`,
      `entityValidationAssignmentRepository.test.ts` x2) — unrelated to any file this section
      touched. 425 → 438 passed matches this section's net test additions. No regression.

## 28. Fixes found during final manual verification (design.md Decisions 21–22)

- [x] 28.1 Vite reload/EADDRINUSE fix — `globalThis`-stashed `httpApp` + in-flight bootstrap
      promise in `init.server.tsx`; `requestContextMiddleware` awaits memoized `initServer()`;
      `API_HTTP_SERVER_ENABLED` flag added. Verified via real restart + edit cycles.
- [x] 28.2 `NoticeListPage.tsx` table layout — `tableLayout: "fixed"` + percentage widths on
      Status/Published/Updated/Actions, Title column absorbs the remainder; `truncate` + `title`
      attribute for overflow.
- [x] 28.3 `DomainError` gains optional `i18nKey`; `NotFoundError` sets
      `common.error.not_found`; `DomainErrorFilter` translates via it. Added `not_found` to
      `locales/{en,fr}/common.json`. Verified live: `fr` → "Notice introuvable".
- [x] 28.4 Confirmed `audience` is not a translation candidate (same as `isPublished`); not
      rendered in the web UI, consistent with `audience` support staying deferred.
- [x] 28.5 `yarn tsc` + full `yarn test:run2` — final regression re-check. Found and fixed 2
      regressions from 28.1's `initServer()`/`bootstrapHttpServer()` changes: (1)
      `requestContext.test.ts` didn't mock `~/init.server`, so its new `await initServer()`
      call tried a real bootstrap — added the mock. (2) `HttpServerBootstrap.test.ts`'s
      `vi.resetModules()` doesn't clear the `globalThis` stash by design (it must survive
      module reload) — added explicit cleanup in `afterEach`. Also found `initServer()`'s own
      `readyPromise` never reset on rejection (unlike the two promises it wraps) — a transient
      bootstrap failure would have wedged the app until a process restart; fixed to match the
      existing reset-on-catch pattern. `yarn tsc` clean; `yarn test:run2` — 438 passed, same 4
      pre-existing failures by identity. No regression.

## 29. Archive

- [x] 29.1 Run `opsx:archive` on this branch (`feature/ca-notices-rest-controller`) before
      raising the PR.
