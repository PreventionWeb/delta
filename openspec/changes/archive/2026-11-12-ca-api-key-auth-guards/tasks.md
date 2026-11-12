# Tasks

## 1. Shared Guard Infrastructure & SessionAuthGuard Relocation

- [x] 1.1 Create `app/infrastructure/guards/AuthenticatedRequest.ts` and barrel export `app/infrastructure/guards/index.ts`
- [x] 1.2 Move `SessionAuthGuard` to `app/infrastructure/guards/SessionAuthGuard.server.ts` and re-export from `app/domains/notices/presentation/guards/SessionAuthGuard.server.ts` for backward compatibility
- [x] 1.3 Verify existing `SessionAuthGuard.test.ts` passes via `yarn vitest run tests/integration/domains/notices/SessionAuthGuard.test.ts`

## 2. ApiKeyAuthGuard (TDD)

- [x] 2.1 Write failing integration tests in `tests/integration/guards/ApiKeyAuthGuard.test.ts` covering valid API key, missing `X-Auth` header, non-existent key, missing tenant association, and ALS request-context hydration
- [x] 2.2 Implement `app/infrastructure/guards/ApiKeyAuthGuard.server.ts` verifying `X-Auth` against `apiKeyTable` with strict tenant and user validation
- [x] 2.3 Verify `tests/integration/guards/ApiKeyAuthGuard.test.ts` passes via `yarn vitest run tests/integration/guards/ApiKeyAuthGuard.test.ts`

## 3. ApiKeyOrSessionAuthGuard (TDD)

- [x] 3.1 Write failing integration tests in `tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts` testing X-Auth delegation, cookie fallback, and rejection when neither credential is valid
- [x] 3.2 Implement `app/infrastructure/guards/ApiKeyOrSessionAuthGuard.server.ts` delegating to `ApiKeyAuthGuard` when `X-Auth` is present and `SessionAuthGuard` otherwise
- [x] 3.3 Verify `tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts` passes via `yarn vitest run tests/integration/guards/ApiKeyOrSessionAuthGuard.test.ts`

## 4. OpenAPI / Swagger Documentation & Notices Controller

- [x] 4.1 Update `app/init.server.tsx` to add `x-auth` apiKey definition to Swagger `DocumentBuilder` alongside `__session`
- [x] 4.2 Update `app/domains/notices/infrastructure/NoticesModule.server.ts` to register `ApiKeyAuthGuard`, `SessionAuthGuard`, and `ApiKeyOrSessionAuthGuard`
- [x] 4.3 Update `app/domains/notices/presentation/NoticesController.server.ts` to use `@UseGuards(ApiKeyOrSessionAuthGuard)` and `@ApiSecurity("x-auth")`
- [x] 4.4 Update `tests/integration/domains/notices/OpenApiDocs.test.ts` and verify via `yarn vitest run tests/integration/domains/notices/OpenApiDocs.test.ts`
- [x] 4.5 Run full notices domain test suite via `yarn vitest run tests/integration/domains/notices/` to verify end-to-end compatibility

## 5. Swagger UI Credential Masking (Security UI Protection)

- [x] 5.1 Implement `customCss` and `customJsStr` in `app/init.server.tsx` to mask the `X-Auth` input field in the Authorize modal
- [x] 5.2 Implement Swagger UI plugin in `customJsStr` in `app/init.server.tsx` to mask `X-Auth: <secret>` in the rendered cURL snippet and copy buffer to `X-Auth: [DELTA API KEY]` while preserving `Cookie: __session=...`
- [x] 5.3 Add integration test in `tests/integration/domains/notices/OpenApiDocs.test.ts` verifying custom script/style injection in `GET /api/v2/docs`
- [x] 5.4 Test in Swagger UI via the browser subagent executing a request and verifying the cURL command displays `[DELTA API KEY]` and the authorize modal input is masked

## 6. Quality Gates & Regression Verification

- [x] 6.1 Quality gate 1 of 10: `yarn vitest run tests/integration/guards/ tests/integration/domains/notices/` — all tests green (9 files, 105 tests)
- [x] 6.2 Quality gate 2 of 10: `yarn tsc` — zero TypeScript errors
- [x] 6.3 Quality gate 3 of 10: `yarn format:check` (scoped Prettier check on modified files)
- [x] 6.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md`
- [x] 6.5 Quality gate 5 of 10: SOLID review
- [x] 6.6 Quality gate 6 of 10: Documentation review — comments explain WHY not WHAT
- [x] 6.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md`
- [x] 6.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md`
- [x] 6.9 Quality gate 9 of 10: Visual/UX parity review (visual verification of masked UI in Swagger verified via browser subagent step 181)
- [x] 6.10 Quality gate 10 of 10: Independent second-opinion review
- [x] 6.11 Mandatory regression suite: `yarn test:run2` (full PGlite suite, all 105 guard & notice domain tests green, 1876 total tests green)
- [x] 6.12 Archive change: run `opsx:archive` before raising PR

## Workflow follow-up

- Restart the application or the `delta-local-app` Docker container to reload the runtime.
- Manually verify in Swagger UI (`http://localhost:3000/api/v2/docs`) by authorizing with an `X-Auth` API key while logged out and executing `GET /api/v2/notices`.
