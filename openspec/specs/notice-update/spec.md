# notice-update Specification

## Purpose
TBD - created by archiving change notices-rest-controller. Update Purpose after archive.
## Requirements
### Requirement: UpdateNoticeUseCase persists a partial update to an existing notice
`UpdateNoticeUseCase.execute()` (`app/domains/notices/application/use-cases/UpdateNotice.ts`)
SHALL accept an `UpdateNoticeCommand { id, tenantId, titleJson?, bodyJson?, isPublished? }`,
fetch the existing `Notice` via `INoticeRepository.findById(id, tenantId)`, merge the supplied
fields over the existing entity's properties, re-validate the merged result via
`Notice.create()`, persist via `INoticeRepository.save()`, and return the updated `NoticeDto`.
`publishedAt` is never a client-supplied field — it is derived per the transition rule below.

#### Scenario: Partial update changes only the supplied fields
- **WHEN** `execute()` is called with `{ id, tenantId, titleJson: { en: "New title" } }` for a
  notice whose `bodyJson` and `isPublished` are already set
- **THEN** the returned `NoticeDto.titleJson` reflects the new value
- **AND** `bodyJson` and `isPublished` are unchanged from the notice's prior state

#### Scenario: updatedAt is refreshed on every successful update
- **WHEN** `execute()` completes successfully
- **THEN** the persisted notice's `updatedAt` is a timestamp later than its previous `updatedAt`

### Requirement: UpdateNoticeUseCase manages publishedAt transitions correctly
`UpdateNoticeUseCase` SHALL derive `publishedAt` rather than accept it as input: transitioning
from unpublished to published stamps the current time; transitioning from published to
unpublished clears it to `null`; and an update that leaves an already-published notice published
SHALL NOT change its existing `publishedAt`.

#### Scenario: Update that first publishes a draft stamps publishedAt
- **WHEN** `execute()` is called with `isPublished: true` for a notice whose `isPublished` was
  previously `false` (`publishedAt` was `null`)
- **THEN** the persisted notice's `isPublished` is `true`
- **AND** the persisted notice's `publishedAt` is set to the current time

#### Scenario: Update that unpublishes a notice clears publishedAt
- **WHEN** `execute()` is called with `isPublished: false` for a notice that was previously
  published (non-null `publishedAt`)
- **THEN** the persisted notice's `isPublished` is `false`
- **AND** the persisted notice's `publishedAt` is `null`

#### Scenario: Update that leaves an already-published notice published does not change publishedAt
- **WHEN** `execute()` is called without `isPublished` (or with `isPublished: true`) for a notice
  that was already published at time T
- **THEN** the persisted notice's `publishedAt` remains exactly T, unchanged

### Requirement: UpdateNoticeUseCase enforces tenant isolation
`UpdateNoticeUseCase` SHALL throw `NoticeNotFoundError` (imported from the shared
`app/domains/notices/application/errors/NoticeErrors.ts`, not redefined) when no notice exists
for the given `id` + `tenantId` pair, and when a notice with that `id` exists but belongs to a
different tenant — the same defence-in-depth check `GetNoticeByIdUseCase` already performs.

#### Scenario: Update fails for a notice belonging to a different tenant
- **WHEN** `execute()` is called with an `id` that exists but whose `tenantId` does not match
  the command's `tenantId`
- **THEN** `NoticeNotFoundError` is thrown
- **AND** `INoticeRepository.save()` is never called

#### Scenario: Update fails for a nonexistent id
- **WHEN** `execute()` is called with an `id` that does not exist for any tenant
- **THEN** `NoticeNotFoundError` is thrown

### Requirement: UpdateNoticeUseCase re-validates domain invariants on every update
`UpdateNoticeUseCase` SHALL re-run `Notice.create()`'s invariant checks (non-empty `titleJson`,
`publishedAt` null when `isPublished` is false) on the merged result — not only at creation
time — and SHALL let `ValidationError` propagate unmodified.

#### Scenario: Update that would clear all title locales is rejected
- **WHEN** `execute()` is called with `titleJson: {}` (or all-empty-string values) merged over
  an existing notice
- **THEN** `ValidationError` propagates from `Notice.create()`
- **AND** `INoticeRepository.save()` is never called

#### Scenario: Non-validation repository errors propagate unmodified
- **WHEN** `INoticeRepository.save()` rejects with an error that is not a `DomainError`
- **THEN** `UpdateNoticeUseCase.execute()` rejects with that same error, unmodified

