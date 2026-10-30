## Purpose

`RevokeHazardousEventShareUseCase` lets a tenant that owns a `hazardous_event` revoke a
previously granted share, enforcing owning-tenant-only the same way granting does.

## ADDED Requirements

### Requirement: Only the owning tenant may revoke a share on its own hazardous event

`RevokeHazardousEventShareUseCase.execute({ hazardousEventId, tenantId,
grantedToCountryAccountsId })` SHALL first resolve `hazardousEventRepository.findById(
hazardousEventId, tenantId)`. When that resolves, it SHALL then call
`hazardousEventShareRepository.revoke(hazardousEventId, grantedToCountryAccountsId)`. When
`findById` throws `NotFoundError` — including when `hazardousEventId` belongs to a different
tenant — this use case MUST propagate that same `NotFoundError` and MUST NOT call `revoke`.

#### Scenario: The owning tenant successfully revokes an existing grant

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`, and a grant exists for
  `(hazardousEventId: "he-1", grantedToCountryAccountsId: "tenant-B")`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B" })` is called
- **THEN** that grant SHALL no longer exist

#### Scenario: A non-owning tenant's revoke attempt is rejected as NotFoundError

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`, not `"tenant-X"`, and a
  grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId: "tenant-B")`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-X",
grantedToCountryAccountsId: "tenant-B" })` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** the existing grant to `"tenant-B"` SHALL remain untouched

### Requirement: Revoking a nonexistent grant on one's own event is a clean no-op

`RevokeHazardousEventShareUseCase.execute` SHALL resolve normally, without throwing, when the
owning tenant check passes but no grant exists for the given
`(hazardousEventId, grantedToCountryAccountsId)` pair — delegating to
`IHazardousEventShareRepository.revoke`'s own no-op contract.

#### Scenario: Revoking a never-granted pair on one's own event resolves normally

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`, and no grant exists for
  `(hazardousEventId: "he-1", grantedToCountryAccountsId: "tenant-B")`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B" })` is called
- **THEN** it SHALL resolve normally, without throwing

### Requirement: Revoke never deletes the underlying causality edge

`RevokeHazardousEventShareUseCase.execute` MUST NOT delete, modify, or otherwise affect any
`hazardous_event_causality` row — it only ever removes the `hazardous_event_share` row.

#### Scenario: Revoking a grant leaves the causal link intact

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`; a grant exists for
  `(hazardousEventId: "he-1", grantedToCountryAccountsId: "tenant-B")`; and a
  `hazardous_event_causality` edge exists touching `"he-1"` whose other side belongs to
  `"tenant-B"`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B" })` is called
- **THEN** the grant SHALL no longer exist
- **AND** the `hazardous_event_causality` edge SHALL remain exactly as it was
