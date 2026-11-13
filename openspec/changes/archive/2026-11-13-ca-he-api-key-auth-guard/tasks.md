# Tasks

## 1. Fix Legacy DEF-002 in `app/backend.server/models/api_key.ts` (TDD)

- [x] 1.1 Write failing unit test in `tests/unit/backend.server/models/apiKeyAuth.test.ts` asserting `apiAuth()` throws a 401 `Response` on missing `X-Auth` and empty array key lookup (`[]`)
- [x] 1.2 Run `yarn vitest run tests/unit/backend.server/models/apiKeyAuth.test.ts` to confirm test fails specifically due to the `DEF-002` bug
- [x] 1.3 Fix `apiAuth()` in `app/backend.server/models/api_key.ts` by checking `if (!key || key.length === 0)`
- [x] 1.4 Re-run `yarn vitest run tests/unit/backend.server/models/apiKeyAuth.test.ts` to verify tests are green

## 2. Restructure Guards Directory & Hydrate Role (TDD)

- [x] 2.1 Create `app/infrastructure/guards/types/AuthenticatedRequest.ts` and `app/infrastructure/guards/types/index.ts` with `role?: RoleId` field
- [x] 2.2 Relocate authentication guards to `app/infrastructure/guards/authn/` (`ApiKeyAuthGuard.server.ts`, `SessionAuthGuard.server.ts`, `ApiKeyOrSessionAuthGuard.server.ts`, `index.ts`)
- [x] 2.3 Update `SessionAuthGuard` to hydrate `req.role` from session role
- [x] 2.4 Update `ApiKeyAuthGuard` to hydrate `req.role` from `userCountryAccountsTable.role`
- [x] 2.5 Re-export all subdomains in root facade `app/infrastructure/guards/index.ts`
- [x] 2.6 Update tests in `tests/integration/guards/ApiKeyAuthGuard.test.ts` and `ApiKeyOrSessionAuthGuard.test.ts` to verify `req.role` hydration
- [x] 2.7 Verify existing guard tests pass via `yarn vitest run tests/integration/guards/`

## 3. Implement RBAC Authorization Guard: `PermissionsGuard` (TDD)

- [x] 3.1 Write failing integration tests in `tests/integration/guards/PermissionsGuard.test.ts` testing `@RequirePermission` with valid role (200), invalid role (403), missing role (403), and unannotated endpoint (200)
- [x] 3.2 Implement `@RequirePermission` decorator in `app/infrastructure/guards/authz/RequirePermission.ts`
- [x] 3.3 Implement `PermissionsGuard` in `app/infrastructure/guards/authz/PermissionsGuard.server.ts`
- [x] 3.4 Create barrel export `app/infrastructure/guards/authz/index.ts` and re-export from root `app/infrastructure/guards/index.ts`
- [x] 3.5 Verify `tests/integration/guards/PermissionsGuard.test.ts` passes via `yarn vitest run tests/integration/guards/PermissionsGuard.test.ts`

## 4. Hazardous Events Presentation Seam & Documentation

- [x] 4.1 Create `app/domains/hazardous-events/presentation/guards/index.ts` re-exporting the guards facade
- [x] 4.2 Update `_docs/refactoring-plan/deferred-items-register.md` marking `DEF-002` as resolved in Phase 6
- [x] 4.3 Update `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` intent 6e details

## 5. Quality Gates & Regression Verification

- [x] 5.1 Quality gate 1 of 10: `yarn vitest run tests/unit/backend.server/models/apiKeyAuth.test.ts tests/integration/guards/` — all tests green
- [x] 5.2 Quality gate 2 of 10: `yarn tsc` — zero TypeScript errors
- [x] 5.3 Quality gate 3 of 10: `yarn format:check` — Prettier clean on modified files
- [x] 5.4 Quality gate 4 of 10: Anti-pattern review — check `.github/skills/anti-pattern-check/SKILL.md`
- [x] 5.5 Quality gate 5 of 10: SOLID review — invoke `solid-reviewer` agent
- [x] 5.6 Quality gate 6 of 10: Documentation review — comments explain WHY not WHAT
- [x] 5.7 Quality gate 7 of 10: Project conventions review — check `.github/copilot-instructions.md`
- [x] 5.8 Quality gate 8 of 10: Code review — run `.github/skills/code-review/SKILL.md` in full
- [x] 5.9 Quality gate 9 of 10: Visual/UX parity review — skipped (no user-facing HTML/CSS or React components touched)
- [x] 5.10 Quality gate 10 of 10: Independent second-opinion review
- [x] 5.11 Mandatory regression suite: `yarn test:run2` (full PGlite suite)
- [x] 5.12 Archive change: run `opsx:archive` on this branch before raising the PR
