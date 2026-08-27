## Context

The Notices domain follows Clean Architecture. Use-cases (`CreateNoticeUseCase`,
`ListNoticesUseCase`, `GetNoticeByIdUseCase`) depend on `INoticeRepository`
(`app/domains/notices/application/ports/INoticeRepository.ts`) via constructor injection.
The infrastructure layer (`app/domains/notices/infrastructure/`) currently holds only a
`.gitkeep`. This design describes the Drizzle adapter that fills that gap.

The `notices` table already exists in production via migration
`2026-06-17-ca-notices-schema-migration`. No schema change is needed here.

## Goals / Non-Goals

**Goals:**
- Provide a NestJS-injectable `DrizzleNoticeRepository` that fulfils every method of
  `INoticeRepository` using Drizzle ORM queries against the `noticesTable`.
- Map every DB row to a valid `Notice` entity via `Notice.create()`.
- Scope ALL queries with `countryAccountsId` to enforce multi-tenancy.
- Map DB error code `"23505"` (unique violation) to `ConflictError`.
- Cover all four methods with PGlite integration tests.

**Non-Goals:**
- Soft-delete support (not in the current schema).
- Caching or read-through layers.
- Changes to use-cases, routes, or the NestJS module wiring (a separate change).
- Changes to the `notices` table schema.

## Decisions

### Decision 1 — File naming: `.server.ts` suffix

`DrizzleNoticeRepository.server.ts` uses the `.server.ts` suffix because it imports
`~/db.server` (a server-only module). React Router's bundler uses this suffix to prevent
accidental client bundle inclusion.

### Decision 2 — NestJS injection: `@Inject(DRIZZLE_CLIENT)` with typed token

The repository is decorated `@Injectable()` and injects the Drizzle client via the typed
`DRIZZLE_CLIENT` token imported from `~/infrastructure/DrizzleProvider.server`. Using the
typed symbol token (not a plain string) guarantees the NestJS DI container and TypeScript
agree on the type at the injection site. The `Dr` type from `~/db.server` carries the full
schema-typed Drizzle client.

### Decision 3 — Upsert via `INSERT ... ON CONFLICT (id) DO UPDATE SET`

`save(notice)` must handle both INSERT (new notice) and UPDATE (existing notice). Drizzle's
`.onConflictDoUpdate({ target: noticesTable.id, set: { ... } })` is the canonical approach
in this codebase. It avoids a SELECT-then-write race condition and maps cleanly to a single
Drizzle call. `updatedAt` is set to `new Date()` (application-side) in the conflict branch
so that callers always observe an accurate timestamp on the returned entity.

### Decision 4 — Row-to-entity mapping via private helper

A private `toEntity(row: SelectNotice): Notice` helper on the class keeps the mapping
co-located with the adapter and makes the method bodies readable. `Notice.create()` is called
inside the helper; if a persisted row somehow violates a domain invariant (e.g., `publishedAt`
set on an unpublished notice due to a data migration error), `Notice.create()` will throw a
`ValidationError` which the caller should treat as a programmer error.

### Decision 5 — `findAll` ordering: `createdAt DESC`

Notices are returned newest-first to match the expected UI behaviour in the list view. The
`ORDER BY created_at DESC` is part of the observable contract specified in the spec.

### Decision 6 — `delete` is idempotent (no error on missing row)

`INoticeRepository.delete` does not throw when the row is absent. Drizzle's `.delete()` does
not error on zero affected rows; the implementation simply issues the DELETE and returns void.
This matches the port contract and simplifies use-case error handling.

### Decision 7 — PGlite for integration tests

PGlite (via `tests/integration/db/setup.ts`) gives a real SQL engine without an external
PostgreSQL instance. The repository is instantiated via `new DrizzleNoticeRepository(dr)` —
no NestJS container needed in tests — which is consistent with the pattern used in
`entityValidationAssignmentRepository.test.ts`.

The `noticesTable` in the test schema already exists
(`tests/integration/db/testSchema/noticesTable.ts`), so no testSchema update is required.

## TypeScript types involved

| Type | Source | Role |
|---|---|---|
| `Dr` | `~/db.server` | Drizzle client type; constructor parameter |
| `SelectNotice` | `~/drizzle/schema/noticesTable` | Row type from `$inferSelect` |
| `InsertNotice` | `~/drizzle/schema/noticesTable` | Insert/upsert payload type |
| `Notice` | `~/domains/notices/domain/Notice` | Domain entity; returned by all methods |
| `NoticeProps` | `~/domains/notices/domain/Notice` | Props shape for `Notice.create()` |
| `LocaleMap` | `~/domains/notices/domain/Notice` | `Record<string, string>`; cast on bodyJson/titleJson |
| `Pagination` | `~/shared/types` | `{ page: number; pageSize: number }` |
| `NotFoundError` | `~/shared/errors/DomainError` | Thrown by `findById` on miss |
| `ConflictError` | `~/shared/errors/DomainError` | Thrown by `save` on unique violation |
| `INoticeRepository` | `~/domains/notices/application/ports/INoticeRepository` | Interface implemented |

## Risks / Trade-offs

- [Risk] `Notice.create()` throws `ValidationError` when a row violates invariants (e.g.,
  `publishedAt` non-null on an unpublished notice). Rows in this state cannot be read.
  → Mitigation: this is an acceptable guard; migration scripts must clean invalid data before
  deployment. A future recovery path is out of scope for this change.

- [Risk] Concurrent `save()` calls with the same `id` but different field values could result
  in whichever upsert arrives last winning silently.
  → Mitigation: the upsert is intentional; last-write-wins is the correct semantics for notice
  edits at this stage of the product. Optimistic locking is out of scope.

- [Risk] `bodyJson` is typed `jsonb` (nullable). The cast `row.bodyJson as LocaleMap | null`
  is unchecked at runtime.
  → Mitigation: upstream `save()` always receives a domain entity whose `bodyJson` was already
  validated as `LocaleMap | null` before persistence. A future JSON schema validator is out of
  scope.

## Migration Plan

No DB migration required. No rollback needed.

The repository class is a new file. It becomes usable when the NestJS notices module (a
separate change) registers it as a provider and injects it into use-cases.

## Open Questions

None. All design decisions above are settled.
