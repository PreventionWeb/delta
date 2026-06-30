## 1. Failing Tests (Red phase)

- [x] 1.1 Create directory `tests/integration/domains/notices/` and write the failing
  integration test at `tests/integration/domains/notices/NoticesModule.test.ts`.
  The test MUST import `"../../db/setup"` as its very first import (two levels up to
  `tests/integration/db/setup.ts`) so the PGlite mock is active.
  Include `import "reflect-metadata"` as the second import (required for NestJS decorators).
  Write failing `it` blocks (all expected to throw "provider not found") for:
  - Module compiles without error
  - `NOTICE_REPOSITORY` resolves to an instance of `DrizzleNoticeRepository`
  - `NOTICE_REPOSITORY` token resolves to the same singleton on repeated `module.get` calls
  - `typeof NOTICE_REPOSITORY` is `"symbol"`
  - `CreateNoticeUseCase` resolves to a defined instance
  - `ListNoticesUseCase` resolves to a defined instance
  - `GetNoticeByIdUseCase` resolves to a defined instance
  - Concurrent `Promise.all` of two `Test.createTestingModule({ imports: [NoticesModule] }).compile()`
    calls both resolve all three use cases and `NOTICE_REPOSITORY`
  Verify all tests fail before proceeding:
  `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts`

## 2. NOTICE_REPOSITORY Token

- [x] 2.1 Create `app/domains/notices/infrastructure/NoticeRepositoryToken.ts`.
  Declare and export `NOTICE_REPOSITORY` as:
  ```ts
  import type { InjectionToken } from "@nestjs/common";
  import type { INoticeRepository } from "~/domains/notices/application/ports/INoticeRepository";
  export const NOTICE_REPOSITORY: InjectionToken<INoticeRepository> = Symbol("NOTICE_REPOSITORY");
  ```
  This pattern mirrors `DRIZZLE_CLIENT` in `DrizzleProvider.server.ts`.
  WHY separate file: the token is imported by `NoticesModule` (infrastructure) and by test
  overrides without pulling in the full repository implementation.

## 3. NoticesModule Implementation (Green phase)

- [x] 3.1 Create `app/domains/notices/infrastructure/NoticesModule.server.ts` (MUST use
  `.server.ts` suffix — this file imports `DrizzleNoticeRepository.server.ts` which
  contains Node.js/pg dependencies; React Router v7's bundler excludes `.server.ts` files
  from the client bundle, preventing these server-only modules from ever reaching the
  browser; without the suffix an accidental client-side import would cause a build failure
  at best and a security leak at worst).
  The module MUST:
  - **NOT import `CoreModule`** — doing so creates a circular dependency
    (`CoreModule → NoticesModule → CoreModule`) that NestJS rejects at compile time.
  - Declare `DrizzleProvider` in its own `providers` array to make `DRIZZLE_CLIENT`
    available within this module's DI scope (same singleton, no new DB connection).
  - Declare `DrizzleNoticeRepository` as a provider using `{ provide: NOTICE_REPOSITORY, useClass: DrizzleNoticeRepository }`.
  - Declare `CreateNoticeUseCase` as a provider using `useFactory`, constructing
    `new CreateNoticeUseCase(new NoOpLogger(), repo)` where `repo` is injected via
    `inject: [NOTICE_REPOSITORY]`.
  - Declare `ListNoticesUseCase` and `GetNoticeByIdUseCase` providers with the same
    `useFactory` pattern.
  - Export `CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`.
  - Do NOT export `NOTICE_REPOSITORY` or `DrizzleNoticeRepository` — callers MUST depend
    on the use case interface, not the adapter directly.

- [x] 3.2 Run `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts`
  and confirm the `NoticesModule`-scoped tests pass (module compiles, tokens resolve,
  concurrent scenario passes). The `CoreModule`-scoped tests will still fail until Task 4.

## 4. CoreModule Update

- [x] 4.1 Update `app/infrastructure/CoreModule.server.ts`: add `NoticesModule` to both
  the `imports` array and the `exports` array of the `@Module` decorator.
  The updated decorator MUST look like:
  ```ts
  @Module({
    imports: [NoticesModule],
    providers: [DrizzleProvider],
    exports: [DrizzleProvider, NoticesModule],
  })
  ```

- [x] 4.2 Run `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts`
  and confirm all tests including the `CoreModule` resolution tests now pass.

- [x] 4.3 Run `yarn vitest run tests/integration/nestjs/CoreModule.test.ts` to confirm
  the existing `CoreModule` tests are still green (no regression).

## 5. Quality Gates

- [x] 5.1 Gate 1 — Tests green:
  `yarn vitest run tests/integration/domains/notices/NoticesModule.test.ts`
  All test cases MUST pass with zero failures.

- [x] 5.2 Gate 2 — TypeScript:
  `yarn tsc`
  MUST produce zero errors. Pay attention to: `NOTICE_REPOSITORY` token type narrowing in
  the `useFactory` inject signature, `InjectionToken` generic parameter, and any
  `@Module` decorator import order.

- [x] 5.3 Gate 3 — Prettier:
  `yarn format:check`
  If it reports violations, run `yarn format` and re-check.

- [x] 5.4 Gate 4 — Anti-pattern review:
  Read `.github/skills/anti-pattern-check/SKILL.md` and verify no listed anti-pattern
  appears in the new or modified files. Specifically check: no `as any`, no plain string
  injection tokens, no `@Global()` on `NoticesModule`.

- [x] 5.5 Gate 5 — SOLID review:
  Invoke the `solid-reviewer` agent on the changed files. Resolve any SRP or DIP
  violations before continuing.

- [x] 5.6 Gate 6 — Documentation review:
  Each comment in `NoticesModule.ts` and `NoticeRepositoryToken.ts` MUST explain WHY,
  not WHAT. The WHY for each provider decision is documented in `design.md` — mirror
  the same rationale in the source comments. Do not over-comment obvious lines.

- [x] 5.7 Gate 7 — Project conventions review:
  Read `.github/copilot-instructions.md` and confirm the new files conform to:
  `.server.ts` suffix rules, path alias (`~/`) usage, module encapsulation, and
  no HTTP controller or auth bypass inside `NoticesModule`.

- [x] 5.8 Gate 8 — Code review:
  Run `.github/skills/code-review/SKILL.md` in full against the diff for this change.
  Resolve any findings before archiving.

## 6. Regression Check

- [x] 6.1 Run `yarn test:run2` (full PGlite suite).
  MUST pass with no new failures. If any failure appears that did not exist on `dev`
  before this branch, investigate and fix before archiving. Pre-existing failures MUST
  be confirmed as pre-existing by running the suite on the base branch first — do not
  label a failure pre-existing without baseline verification.

## 7. Archive and PR

- [x] 7.1 Run `/opsx:archive` on this branch to close the OpenSpec change.

- [x] 7.2 Raise a PR targeting `dev` (never `main`) with prefix `Feature:` in the
  title. The PR description MUST reference the roadmap item (4h) and list the three
  files created and one file modified.
