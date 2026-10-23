## Purpose

Defines `IHazardousEventShareRepository`, the persistence port for `hazardous_event_share` —
records that one tenant has granted another tenant the right to know about a specific
`hazardous_event` of its own, the access-control primitive closing `DEF-012`.

## ADDED Requirements

### Requirement: grant creates a share record idempotently

`IHazardousEventShareRepository.grant(hazardousEventId, grantedToCountryAccountsId,
grantedByUserId, reason, tx?)` SHALL persist exactly one row in `hazardous_event_share` with
those values when no row already exists for `(hazardousEventId, grantedToCountryAccountsId)`.
When a row already exists for that pair, it SHALL resolve normally without throwing and SHALL
NOT create a second row or modify the existing row's `grantedByUserId`/`reason`/`createdAt`.
When an optional `tx` is supplied, the insert MUST execute against that same `tx`.

#### Scenario: A new grant is persisted

- **GIVEN** no row exists in `hazardous_event_share` for `(hazardousEventId: "he-1",
grantedToCountryAccountsId: "tenant-B")`
- **WHEN** `grant("he-1", "tenant-B", "user-1", "transboundary flood response")` is called
- **THEN** exactly one row SHALL exist with those values

#### Scenario: A null reason is persisted as null

- **GIVEN** no existing grant for the pair
- **WHEN** `grant("he-1", "tenant-B", "user-1", null)` is called
- **THEN** the persisted row's `reason` SHALL be `null`

#### Scenario: Granting an already-granted pair is a no-op, not an error

- **GIVEN** a row already exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** `grant("he-1", "tenant-B", "user-2", "different reason")` is called again
- **THEN** it SHALL resolve normally without throwing
- **AND** exactly one row SHALL still exist for that pair
- **AND** the original row's `grantedByUserId`/`reason` SHALL be unchanged

#### Scenario: Two concurrent grant calls for the same pair both resolve successfully, leaving exactly one row

- **GIVEN** no existing grant for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** two concurrent `grant("he-1", "tenant-B", "user-1", null)` calls are made before
  either resolves
- **THEN** both calls SHALL resolve normally — neither SHALL reject with a unique-constraint
  error
- **AND** exactly one row SHALL exist for that pair afterward

#### Scenario: Granting different grantee tenants for the same event persists both independently

- **GIVEN** no existing grants for `hazardousEventId: "he-1"`
- **WHEN** `grant("he-1", "tenant-B", "user-1", null)` and `grant("he-1", "tenant-C", "user-1",
null)` are both called
- **THEN** two distinct rows SHALL exist, one per grantee tenant

### Requirement: revoke removes a share record without affecting the underlying causal link

`IHazardousEventShareRepository.revoke(hazardousEventId, grantedToCountryAccountsId, tx?)` SHALL
remove the `hazardous_event_share` row for that pair, if one exists. It SHALL resolve normally,
not throwing, when no matching row exists. It MUST NOT delete, modify, or otherwise affect any
`hazardous_event_causality` row.

#### Scenario: An existing grant is removed

- **GIVEN** a grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** `revoke("he-1", "tenant-B")` is called
- **THEN** no `hazardous_event_share` row SHALL remain for that pair

#### Scenario: Revoking a nonexistent grant is a clean no-op

- **GIVEN** no grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** `revoke("he-1", "tenant-B")` is called
- **THEN** it SHALL resolve normally, without throwing

#### Scenario: Revoking one grant does not remove the underlying causality edge

- **GIVEN** a grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`, and a `hazardous_event_causality` edge exists whose other side is `"he-1"` and
  whose owning tenant is `"tenant-B"`
- **WHEN** `revoke("he-1", "tenant-B")` is called
- **THEN** the `hazardous_event_share` row SHALL no longer exist
- **AND** the `hazardous_event_causality` edge SHALL remain exactly as it was, untouched

#### Scenario: Revoking one grantee tenant's grant does not affect another grantee tenant's grant on the same event

- **GIVEN** grants exist for both `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")` and `(hazardousEventId: "he-1", grantedToCountryAccountsId: "tenant-C")`
- **WHEN** `revoke("he-1", "tenant-B")` is called
- **THEN** the grant to `"tenant-B"` SHALL no longer exist
- **AND** the grant to `"tenant-C"` SHALL remain

### Requirement: hasGrant reports whether an active grant exists for a pair

`IHazardousEventShareRepository.hasGrant(hazardousEventId, grantedToCountryAccountsId, tx?)`
SHALL resolve `true` when a `hazardous_event_share` row exists for that exact pair, and `false`
otherwise. When an optional `tx` is supplied, the check MUST execute against that same `tx`, so a
caller nesting this call inside its own open transaction observes that transaction's own
uncommitted writes.

#### Scenario: An active grant resolves true

- **GIVEN** a grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** `hasGrant("he-1", "tenant-B")` is called
- **THEN** it SHALL resolve `true`

#### Scenario: No grant resolves false

- **GIVEN** no grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** `hasGrant("he-1", "tenant-B")` is called
- **THEN** it SHALL resolve `false`

#### Scenario: A grant to a different tenant does not satisfy the check for this tenant

- **GIVEN** a grant exists for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-C")` only
- **WHEN** `hasGrant("he-1", "tenant-B")` is called
- **THEN** it SHALL resolve `false`

#### Scenario: A revoked grant resolves false afterward

- **GIVEN** a grant existed for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")` and was then revoked
- **WHEN** `hasGrant("he-1", "tenant-B")` is called
- **THEN** it SHALL resolve `false`

#### Scenario: A revoke racing a hasGrant read resolves to one consistent, non-partial outcome

- **GIVEN** an active grant for `(hazardousEventId: "he-1", grantedToCountryAccountsId:
"tenant-B")`
- **WHEN** a `revoke("he-1", "tenant-B")` call and a `hasGrant("he-1", "tenant-B")` call execute
  concurrently
- **THEN** the `hasGrant` call SHALL resolve either `true` or `false` — whichever reflects
  whether the revoke had committed as of the read — and MUST NOT resolve an inconsistent or
  partially-applied result

### Requirement: No method on IHazardousEventShareRepository accepts a raw Drizzle or infrastructure type

The port's method signatures MUST be expressed only in terms of primitive types and `Tx` — never
a Drizzle `$inferSelect`/`$inferInsert` row type from `hazardousEventShareTable.ts`.

#### Scenario: No Drizzle type appears in the interface's method signatures

- **GIVEN** the `IHazardousEventShareRepository` interface source
- **WHEN** its imports and method signatures are inspected
- **THEN** none MUST reference `SelectHazardousEventShare`, `InsertHazardousEventShare`, or any
  other Drizzle-inferred row type
- **AND** the presence of `Tx` on any method MUST NOT be treated as a violation of this
  requirement
