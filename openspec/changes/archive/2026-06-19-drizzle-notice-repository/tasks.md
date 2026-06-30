## 1. Red Phase — Write Failing Integration Tests

- [x] 1.1 Create `tests/integration/db/queries/DrizzleNoticeRepository.test.ts` with
  `import "../setup"` as the first line. Add helper functions `insertCountry` and
  `insertCountryAccount` (same pattern as `notices.test.ts`). Import `noticesTable` from
  `~/drizzle/schema`, `countriesTable` from `../testSchema/countriesTable`, and
  `countryAccounts` from `../testSchema/countryAccounts`.

- [x] 1.2 Add a `describe("DrizzleNoticeRepository")` block. Import
  `DrizzleNoticeRepository` from
  `~/domains/notices/infrastructure/DrizzleNoticeRepository.server` and instantiate it as
  `new DrizzleNoticeRepository(dr)` in a `beforeEach`-scoped or inline constant.

- [x] 1.3 Write failing test: **save → INSERT** — construct a `Notice` entity, call
  `repo.save(notice)`, then read the row back with `dr.select().from(noticesTable)` and
  assert all fields match (including `tenantId` → `countryAccountsId` mapping).

- [x] 1.4 Write failing test: **save → UPDATE** — save a notice, mutate `titleJson`, save
  again, assert the returned entity has the new title and that `updatedAt` is newer than the
  original.

- [x] 1.5 Write failing test: **save → concurrent upsert** — call `repo.save(notice)` twice
  concurrently with the same `id` via `Promise.all`; assert exactly one row with that `id`
  exists in the DB after both resolve (upsert idempotency).

- [x] 1.6 Write failing test: **findById — happy path** — save a notice, call
  `repo.findById(id, tenantId)`, assert returned entity fields.

- [x] 1.7 Write failing test: **findById — not found** — call `repo.findById(unknownId, T)`,
  assert it throws `NotFoundError`.

- [x] 1.8 Write failing test: **findById — tenant isolation** — save notice for tenant A, call
  `repo.findById(id, tenantB)`, assert it throws `NotFoundError`.

- [x] 1.9 Write failing test: **findAll — returns paginated list scoped to tenant** — insert
  two notices for tenant T and one for tenant T_OTHER, call `repo.findAll(T, { page: 1,
  pageSize: 10 })`, assert only T's notices returned in newest-first order.

- [x] 1.10 Write failing test: **findAll — empty** — call `findAll` for a fresh tenant with no
  notices, assert result is `[]`.

- [x] 1.11 Write failing test: **findAll — pagination page 2** — insert two notices for T, call
  `findAll(T, { page: 2, pageSize: 1 })`, assert only the older notice is returned.

- [x] 1.12 Write failing test: **delete — removes notice** — save a notice, call
  `repo.delete(id, tenantId)`, then assert `findById` throws `NotFoundError`.

- [x] 1.13 Write failing test: **delete — idempotent** — call `repo.delete(unknownId, T)`,
  assert no error is thrown.

- [x] 1.14 Write failing test: **full field round-trip** — save a fully-populated notice
  (with `bodyJson` and `publishedAt`), call `findById`, assert every mapped field is equal
  to the original entity (covers the row-to-entity mapping requirement).

- [x] 1.15 Confirm all tests in the new file fail with an import error (module not found) by
  running:
  ```shell
  yarn vitest run tests/integration/db/queries/DrizzleNoticeRepository.test.ts
  ```

## 2. Green Phase — Implement DrizzleNoticeRepository

- [x] 2.1 Create `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts`.
  Add the class skeleton: `@Injectable()`, constructor with `@Inject(DRIZZLE_CLIENT) private
  readonly db: Dr`, and stub implementations for all four methods that throw
  `new Error("not implemented")`.

- [x] 2.2 Implement the private `toEntity(row: SelectNotice): Notice` helper that maps every
  column to the corresponding `NoticeProps` field and calls `Notice.create(props)`.

- [x] 2.3 Implement `findById(id, tenantId)`: query with
  `and(eq(noticesTable.id, id), eq(noticesTable.countryAccountsId, tenantId))`, throw
  `new NotFoundError("Notice", id)` if no row returned, otherwise call `toEntity(row)`.

- [x] 2.4 Implement `findAll(tenantId, pagination)`: query with
  `eq(noticesTable.countryAccountsId, tenantId)`, `orderBy(desc(noticesTable.createdAt))`,
  `limit(pagination.pageSize)`,
  `offset((pagination.page - 1) * pagination.pageSize)`. Return `rows.map(toEntity)`.

- [x] 2.5 Implement `save(notice)`: build the values object from `notice.*`, execute
  `.insert(noticesTable).values(values).onConflictDoUpdate({ target: noticesTable.id, set:
  { titleJson, bodyJson, isPublished, audience, publishedAt, updatedAt: new Date() } })
  .returning()`. Catch PostgreSQL error code `"23505"` and rethrow as
  `new ConflictError("Notice already exists")`. Return `toEntity(rows[0])`.

- [x] 2.6 Implement `delete(id, tenantId)`: execute
  `.delete(noticesTable).where(and(eq(noticesTable.id, id),
  eq(noticesTable.countryAccountsId, tenantId)))`. Return void (no error on zero rows).

- [x] 2.7 Run the test suite and iterate until all 16 test cases are green:
  ```shell
  yarn vitest run tests/integration/db/queries/DrizzleNoticeRepository.test.ts
  ```

## 3. Refactor Phase — Quality Gates

- [x] 3.1 **Gate 1 — Tests green:**
  ```shell
  yarn vitest run tests/integration/db/queries/DrizzleNoticeRepository.test.ts
  ```
  All 16 tests MUST pass.

- [x] 3.2 **Gate 2 — TypeScript:**
  ```
  yarn tsc
  ```
  Zero errors. Fix any strict-mode issues (avoid `as any`).

- [x] 3.3 **Gate 3 — Prettier:**
  ```shell
  yarn format:check
  ```
  If it fails, run `yarn format` and re-verify.

- [x] 3.4 **Gate 4 — Anti-pattern review:** Read
  `.github/skills/anti-pattern-check/SKILL.md` and confirm the implementation violates none
  of the listed anti-patterns. Pay particular attention to: multi-tenancy scoping on every
  query, no `as any` casts, `.server.ts` suffix, no plain-string injection tokens.

- [x] 3.5 **Gate 5 — SOLID review:** Invoke the `solid-reviewer` agent on
  `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts`. Address any SRP
  or DIP violations before proceeding.

- [x] 3.6 **Gate 6 — Documentation review:** Verify that comments in the implementation file
  explain WHY (business reason, invariant, risk) not WHAT (restating the code). The
  `toEntity` helper and each method should have a short JSDoc if the intent is not
  self-evident.

- [x] 3.7 **Gate 7 — Project conventions review:** Read
  `.github/copilot-instructions.md` and confirm the implementation follows all relevant
  conventions (file naming, import aliases, error types, injection token usage).

- [x] 3.8 **Gate 8 — Code review:** Run the `code-review` skill
  (`.github/skills/code-review/SKILL.md`) in full over the two new files. Resolve all
  findings before marking this gate done.

## 4. Regression and Archive

- [x] 4.1 **Regression — full PGlite suite:** Run the full integration test suite and confirm
  no new failures have been introduced:
  ```shell
  yarn test:run2
  ```
  Any failure that was not present before this change MUST be investigated and fixed before
  archiving. Pre-existing failures must be confirmed as pre-existing (run on the base branch
  if uncertain).

- [x] 4.2 **Archive:** On the same branch, run `/opsx:archive` to archive the completed
  change before raising the PR.
