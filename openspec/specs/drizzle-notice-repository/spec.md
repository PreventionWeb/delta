## ADDED Requirements

### Requirement: findById returns a Notice entity scoped to the tenant

`DrizzleNoticeRepository.findById(id, tenantId)` MUST query the `notices` table with a
two-column WHERE clause: `id = $id AND country_accounts_id = $tenantId`. It MUST map the
matching row to a `Notice` entity via `Notice.create()` and return it. It MUST throw
`NotFoundError` (from `~/shared/errors/DomainError`) when no row matches the clause.

#### Scenario: Happy path — notice found for the correct tenant

- **GIVEN** a notice row exists in the DB with `id = X` and `country_accounts_id = T`
- **WHEN** `findById(X, T)` is called
- **THEN** the method MUST return a `Notice` entity whose `id` equals `X` and `tenantId`
  equals `T`, with all other fields matching the persisted row

#### Scenario: Not found — id does not exist

- **GIVEN** no notice row with `id = X` exists in the DB for any tenant
- **WHEN** `findById(X, T)` is called
- **THEN** the method MUST throw `NotFoundError`

#### Scenario: Tenant isolation — id exists but belongs to a different tenant

- **GIVEN** a notice row exists with `id = X` and `country_accounts_id = T_OTHER`
- **WHEN** `findById(X, T)` is called where `T != T_OTHER`
- **THEN** the method MUST throw `NotFoundError` (it MUST NOT return the other tenant's notice)

---

### Requirement: findAll returns a paginated list scoped to the tenant

`DrizzleNoticeRepository.findAll(tenantId, pagination)` MUST query the `notices` table with
`WHERE country_accounts_id = $tenantId`, order results by `created_at DESC`, apply
`LIMIT pagination.pageSize` and `OFFSET (pagination.page - 1) * pagination.pageSize`. It
MUST return a `Notice[]`. It MUST return an empty array when the tenant has no notices.
It MUST NOT return notices belonging to a different tenant.

#### Scenario: Returns notices for the tenant in newest-first order

- **GIVEN** tenant T has two notices: notice A (created earlier) and notice B (created later)
- **WHEN** `findAll(T, { page: 1, pageSize: 10 })` is called
- **THEN** the result MUST be `[noticeB, noticeA]` (newest first)

#### Scenario: Excludes notices from other tenants

- **GIVEN** tenant T has one notice and tenant T_OTHER has one notice
- **WHEN** `findAll(T, { page: 1, pageSize: 10 })` is called
- **THEN** the result MUST contain exactly the notice belonging to T, not the one belonging to T_OTHER

#### Scenario: Empty result when tenant has no notices

- **GIVEN** tenant T has no notices in the DB
- **WHEN** `findAll(T, { page: 1, pageSize: 10 })` is called
- **THEN** the method MUST return `[]`

#### Scenario: Pagination — page 2 with pageSize 1

- **GIVEN** tenant T has two notices: notice A (created earlier) and notice B (created later)
- **WHEN** `findAll(T, { page: 2, pageSize: 1 })` is called
- **THEN** the result MUST contain exactly notice A (the second-newest notice, i.e. offset 1)

---

### Requirement: save performs an upsert and returns the persisted Notice entity

`DrizzleNoticeRepository.save(notice)` MUST perform an INSERT into the `notices` table. If
a row with the same `id` already exists, it MUST perform an UPDATE (upsert via ON CONFLICT DO
UPDATE) covering all mutable fields: `titleJson`, `bodyJson`, `isPublished`, `audience`,
`publishedAt`, and `updatedAt`. The method MUST return the saved row mapped to a `Notice`
entity. On a unique constraint violation (PostgreSQL error code `"23505"`) it MUST throw
`ConflictError` (from `~/shared/errors/DomainError`).

#### Scenario: INSERT — saving a new notice persists all fields

- **GIVEN** no notice with the given `id` exists in the DB
- **WHEN** `save(notice)` is called with a fully-populated notice entity
- **THEN** a row MUST be created in the `notices` table with all fields matching the entity,
  AND the returned `Notice` entity MUST match the persisted row

#### Scenario: UPDATE — saving an existing notice updates mutable fields

- **GIVEN** a notice with `id = X` already exists in the DB
- **WHEN** `save(notice)` is called where `notice.id = X` with changed `titleJson`
- **THEN** the row with `id = X` MUST be updated to reflect the new `titleJson`,
  AND the `updatedAt` timestamp MUST be newer than the original `updatedAt`,
  AND the returned entity MUST reflect the updated values

#### Scenario: Concurrent callers — two concurrent save calls with the same new id

- **GIVEN** no notice with `id = X` exists in the DB
- **WHEN** two `save(notice)` calls with `id = X` are issued concurrently via `Promise.all`
- **THEN** exactly one row with `id = X` MUST exist in the DB after both resolve (the upsert
  MUST be idempotent; the second call updates the row created by the first)

---

### Requirement: delete removes the notice scoped to the tenant and is idempotent

`DrizzleNoticeRepository.delete(id, tenantId)` MUST issue a DELETE against the `notices` table
with a two-column WHERE clause: `id = $id AND country_accounts_id = $tenantId`. It MUST
return `void`. It MUST NOT throw when the row does not exist. It MUST NOT delete notices
belonging to a different tenant even if `id` matches.

#### Scenario: Removes an existing notice

- **GIVEN** a notice with `id = X` and `country_accounts_id = T` exists in the DB
- **WHEN** `delete(X, T)` is called
- **THEN** the row MUST be removed from the DB,
  AND a subsequent `findById(X, T)` call MUST throw `NotFoundError`

#### Scenario: Idempotent — deleting a non-existent notice does not throw

- **GIVEN** no notice with `id = X` exists in the DB for tenant T
- **WHEN** `delete(X, T)` is called
- **THEN** the method MUST return void without throwing

---

### Requirement: Row-to-entity field mapping is exact and complete

`DrizzleNoticeRepository` MUST map every column in `SelectNotice` to the corresponding
`NoticeProps` field before calling `Notice.create()`. The mapping MUST be:

| DB column | `NoticeProps` field | Notes |
|---|---|---|
| `id` | `id` | direct |
| `country_accounts_id` | `tenantId` | renamed |
| `title_json` | `titleJson` | cast to `LocaleMap` |
| `body_json` | `bodyJson` | cast to `LocaleMap \| null` |
| `is_published` | `isPublished` | direct |
| `audience` | `audience` | direct (`Audience` union) |
| `published_at` | `publishedAt` | `Date \| null` |
| `created_at` | `createdAt` | `Date` |
| `updated_at` | `updatedAt` | `Date` |

#### Scenario: All fields round-trip through save and findById

- **GIVEN** a fully-populated notice entity with all optional fields set (bodyJson, publishedAt)
- **WHEN** `save(notice)` is called and then `findById(notice.id, notice.tenantId)` is called
- **THEN** the returned entity MUST have values equal to the original entity's values for every
  field listed in the mapping table above
