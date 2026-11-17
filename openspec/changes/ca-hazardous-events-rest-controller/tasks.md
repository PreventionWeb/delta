# Tasks

## 1. Presentation DTOs & Validation Schemas (TDD)

- [x] 1.1 Create `app/domains/hazardous-events/presentation/dto/HazardousEventIdParam.ts` with `HazardousEventIdParam` and `ApiHazardousEventIdParam` decorator
- [x] 1.2 Create `app/domains/hazardous-events/presentation/dto/CreateHazardousEventRequest.ts` with `nestjs-zod` DTO for event creation
- [x] 1.3 Create `app/domains/hazardous-events/presentation/dto/UpdateHazardousEventRequest.ts` with `nestjs-zod` DTO for partial event updates
- [x] 1.4 Create `app/domains/hazardous-events/presentation/dto/RecordSpatialObservationRequest.ts` with `nestjs-zod` DTO for spatial observations
- [x] 1.5 Create `app/domains/hazardous-events/presentation/dto/HazardousEventResponseDto.ts` defining typed OpenAPI response schemas
- [x] 1.6 Create `app/domains/hazardous-events/presentation/dto/index.ts` barrel export

## 2. Failing Integration Test Suite (TDD)

- [x] 2.1 Create `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts` covering:
  - Authentication (401 on missing/invalid `X-Auth`)
  - Authorization (403 on missing `ViewData` or `EditData`)
  - Multi-tenancy isolation (discard payload tenant ID, foreign tenant 404)
  - `GET /hazardous-events` (200 with pagination, filters, data-viewer status restriction)
  - `GET /hazardous-events/:id` (200 on existing, 400 on non-UUID, 404 on nonexistent/foreign)
  - `POST /hazardous-events` (201 on valid body, 422 on invalid body, user attribution verified)
  - `PUT /hazardous-events/:id` (200 on valid body, 400 on non-UUID, 404 on nonexistent, 422 on invalid body)
  - `DELETE /hazardous-events/:id` (204 on success, 404 on nonexistent, 409 Conflict with dependent counts)
  - `POST /hazardous-events/:id/spatial-observations` (201 on valid body, 409 Conflict on duplicate time without replace, 201 on duplicate time with replace)
  - OpenAPI schema generation at `/api/v2/docs-json`
- [x] 2.2 Run `yarn vitest run tests/integration/domains/hazardous-events/HazardousEventsController.test.ts` to confirm tests fail due to missing controller routes

## 3. Controller Implementation & Module Registration

- [x] 3.1 Implement `HazardousEventsController.server.ts` in `app/domains/hazardous-events/presentation/` with `@Controller("hazardous-events")`, `@UseGuards(ApiKeyOrSessionAuthGuard, PermissionsGuard)`, `@ApiSecurity("x-auth")`, and all six endpoints
- [x] 3.2 Register `HazardousEventsController` in `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` under `controllers`
- [x] 3.3 Verify all tests in `tests/integration/domains/hazardous-events/HazardousEventsController.test.ts` pass via `yarn vitest run tests/integration/domains/hazardous-events/HazardousEventsController.test.ts`

## 4. Documentation & Roadmap

- [x] 4.1 Update `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` intent 6f status

## 5. Quality Gates & Regression Verification

- [x] 5.1 Quality gate 1 of 10: `yarn vitest run tests/integration/domains/hazardous-events/HazardousEventsController.test.ts` — tests green (20/20 passed)
- [x] 5.2 Quality gate 2 of 10: `yarn tsc` — zero TypeScript errors
- [x] 5.3 Quality gate 3 of 10: `yarn prettier --check` — Prettier clean on modified files
- [x] 5.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md` (verified, 0 findings)
- [x] 5.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent (verified, PASS)
- [x] 5.6 Quality gate 6 of 10: Documentation review — comments explain WHY not WHAT, compacted where possible, full diff sweep (verified, PASS)
- [x] 5.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md` (verified, PASS)
- [x] 5.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full via fresh subagent (verified, PASS)
- [x] 5.9 Quality gate 9 of 10: Visual/UX parity review — explicitly evaluate REST presentation scope (no React components touched) (verified, N/A PASS)
- [x] 5.10 Quality gate 10 of 10: Independent second-opinion review via fresh subagent (verified, PASS)
- [x] 5.11 Test quality auditor task: invoke `test-quality-auditor` scoped to changed files under `app/domains/hazardous-events/` (verified, 20/20 tests passing)
- [x] 5.12 Mandatory regression suite: `yarn test:run2` (full PGlite suite) passes with no new failures (152 test files passing, 2 pre-existing failures confirmed)
- [ ] 5.13 Archive change: run `/opsx:archive` on this branch before raising PR
