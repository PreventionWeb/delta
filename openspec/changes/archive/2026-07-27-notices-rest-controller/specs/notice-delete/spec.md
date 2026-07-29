## ADDED Requirements

### Requirement: DeleteNoticeUseCase removes a notice within its tenant
`DeleteNoticeUseCase.execute()` (`app/domains/notices/application/use-cases/DeleteNotice.ts`)
SHALL accept a `DeleteNoticeCommand { id, tenantId }`, verify the notice exists for that tenant
via `INoticeRepository.findById(id, tenantId)`, then call `INoticeRepository.delete(id,
tenantId)`, and resolve with `void`.

#### Scenario: Successful delete
- **WHEN** `execute()` is called with an `id`/`tenantId` pair that exists
- **THEN** `INoticeRepository.delete()` is called with that `id` and `tenantId`
- **AND** the returned promise resolves with no value

### Requirement: DeleteNoticeUseCase enforces tenant isolation
`DeleteNoticeUseCase` SHALL throw `NoticeNotFoundError` (imported from the shared
`app/domains/notices/application/errors/NoticeErrors.ts`, not redefined) when no notice exists
for the given `id` + `tenantId` pair, or when a notice with that `id` exists but belongs to a
different tenant, and SHALL NOT call `INoticeRepository.delete()` in either case.

#### Scenario: Delete fails for a notice belonging to a different tenant
- **WHEN** `execute()` is called with an `id` that exists but whose `tenantId` does not match
  the command's `tenantId`
- **THEN** `NoticeNotFoundError` is thrown
- **AND** `INoticeRepository.delete()` is never called

#### Scenario: Delete fails for a nonexistent id
- **WHEN** `execute()` is called with an `id` that does not exist for any tenant
- **THEN** `NoticeNotFoundError` is thrown
- **AND** `INoticeRepository.delete()` is never called

### Requirement: DeleteNoticeUseCase propagates non-existence errors from the repository unmodified
`DeleteNoticeUseCase` SHALL let any error from `INoticeRepository.delete()` that is not a
`DomainError` propagate unmodified.

#### Scenario: Unexpected repository error during delete propagates
- **WHEN** the existence check succeeds but `INoticeRepository.delete()` rejects with a
  non-`DomainError` error
- **THEN** `DeleteNoticeUseCase.execute()` rejects with that same error, unmodified
