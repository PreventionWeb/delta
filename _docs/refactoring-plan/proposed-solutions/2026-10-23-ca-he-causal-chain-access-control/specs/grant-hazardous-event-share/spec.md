## Purpose

`GrantHazardousEventShareUseCase` lets a tenant that owns a `hazardous_event` grant another
tenant the right to know about it, enforcing owning-tenant-only via the same tenant-scoped
`findById`-as-non-disclosure pattern used throughout this domain.

## ADDED Requirements

### Requirement: Only the owning tenant may grant a share on its own hazardous event

`GrantHazardousEventShareUseCase.execute({ hazardousEventId, tenantId,
grantedToCountryAccountsId, actingUserId, reason? })` SHALL first resolve
`hazardousEventRepository.findById(hazardousEventId, tenantId)`. When that resolves (the event
belongs to `tenantId`), it SHALL then call `hazardousEventShareRepository.grant(hazardousEventId,
grantedToCountryAccountsId, actingUserId, reason ?? null)`. When `findById` throws
`NotFoundError` — including when `hazardousEventId` exists but belongs to a different tenant —
this use case MUST propagate that same `NotFoundError` and MUST NOT call `grant`.

#### Scenario: The owning tenant successfully grants a share

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B", actingUserId: "user-1", reason: "transboundary flood"
})` is called
- **THEN** a grant SHALL be persisted for `(hazardousEventId: "he-1",
grantedToCountryAccountsId: "tenant-B")` with `grantedByUserId: "user-1"`

#### Scenario: A non-owning tenant's grant attempt is rejected as NotFoundError, not a distinct forbidden error

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`, not `"tenant-X"`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-X",
grantedToCountryAccountsId: "tenant-B", actingUserId: "user-1" })` is called
- **THEN** it SHALL throw `NotFoundError`
- **AND** no grant row SHALL be created
- **AND** the error MUST NOT distinguish "exists but not yours" from "does not exist" — matching
  `IHazardousEventRepository.findById`'s own existing non-disclosure contract

#### Scenario: A nonexistent hazardousEventId is rejected the same way as a foreign-tenant one

- **GIVEN** no `hazardous_event` exists with id `"he-missing"`
- **WHEN** `execute({ hazardousEventId: "he-missing", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B", actingUserId: "user-1" })` is called
- **THEN** it SHALL throw `NotFoundError`

### Requirement: A tenant cannot grant a share to itself

`GrantHazardousEventShareUseCase.execute` SHALL throw a `ValidationError` when
`grantedToCountryAccountsId` equals `tenantId`, before resolving `findById` or calling `grant`.

#### Scenario: Granting to one's own tenant id is rejected

- **GIVEN** `hazardousEventId: "he-1"` belongs to `tenantId: "tenant-A"`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-A", actingUserId: "user-1" })` is called
- **THEN** it SHALL throw `ValidationError`
- **AND** no grant row SHALL be created

### Requirement: Granting an already-granted pair succeeds idempotently

`GrantHazardousEventShareUseCase.execute` SHALL resolve normally, without throwing, when a grant
already exists for the given `(hazardousEventId, grantedToCountryAccountsId)` pair — delegating
to `IHazardousEventShareRepository.grant`'s own idempotent contract.

#### Scenario: Re-granting an existing share is a no-op, not an error

- **GIVEN** a grant already exists for `(hazardousEventId: "he-1",
grantedToCountryAccountsId: "tenant-B")`, owned by `tenantId: "tenant-A"`
- **WHEN** `execute({ hazardousEventId: "he-1", tenantId: "tenant-A",
grantedToCountryAccountsId: "tenant-B", actingUserId: "user-2" })` is called again
- **THEN** it SHALL resolve normally, without throwing
- **AND** exactly one grant row SHALL exist for that pair
