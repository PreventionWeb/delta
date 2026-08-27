## Why

The Notices domain has a defined `INoticeRepository` port and a complete set of use-cases
(`CreateNoticeUseCase`, `ListNoticesUseCase`, `GetNoticeByIdUseCase`) but no infrastructure
adapter. Without `DrizzleNoticeRepository` the NestJS module cannot wire the DI container and
no use-case can be executed against real persistence.

## What Changes

- **New file** `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts` — Drizzle
  adapter implementing `INoticeRepository`; decorated with `@Injectable()` and injected with
  `DRIZZLE_CLIENT`.
- **New file** `tests/integration/db/queries/DrizzleNoticeRepository.test.ts` — PGlite
  integration tests covering all four repository methods across 16 scenarios.

No DB migration is required — the `notices` table was created in a prior change
(`2026-06-17-ca-notices-schema-migration`).

**Test approach:** PGlite integration (`yarn test:run2`). No unit mocks are used for the DB
layer; the repository is instantiated directly via `new DrizzleNoticeRepository(dr)`.

**Security / multi-tenancy:** Every query that reads or writes notices MUST scope with
`eq(noticesTable.countryAccountsId, tenantId)`. Cross-tenant access is a security boundary.
`findById` and `delete` use a two-column WHERE clause (`id AND countryAccountsId`). `findAll`
filters exclusively by `countryAccountsId`. These are called out as load-bearing invariants in
the specs.

## Capabilities

### New Capabilities

- `drizzle-notice-repository`: Drizzle ORM adapter that fulfils `INoticeRepository`; covers
  `findById`, `findAll`, `save` (upsert), and `delete` with full multi-tenancy scoping.

### Modified Capabilities

<!-- none -->

## Impact

- `app/domains/notices/infrastructure/DrizzleNoticeRepository.server.ts` — new file
- `tests/integration/db/queries/DrizzleNoticeRepository.test.ts` — new file
- `app/domains/notices/application/ports/INoticeRepository.ts` — JSDoc updated: `save()` now documents `@throws {ConflictError}`
- `app/drizzle/schema/noticesTable.ts` — read-only; no changes
- `app/infrastructure/DrizzleProvider.server.ts` — read-only; `DRIZZLE_CLIENT` token imported
- `app/shared/errors/DomainError.ts` — read-only; `NotFoundError` and `ConflictError` imported
- No DB migration required
- No fieldsDef / Form-CSV-API pipeline impact
- No route or handler changes
