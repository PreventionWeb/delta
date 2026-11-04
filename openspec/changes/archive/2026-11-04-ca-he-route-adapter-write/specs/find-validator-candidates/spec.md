## Purpose

Defines `FindValidatorCandidatesUseCase` (`application/use-cases/FindValidatorCandidates.ts`), the
`validation-workflow` application-layer use case that owns the validator-then-admin-fallback policy
for resolving a tenant's candidate validators for the `submit-validation` workflow action. Moved
here from `IValidatorCandidateRepository`/its Drizzle adapter during implementation (Gate 5 SOLID
review, DIP finding, user-approved) — the fallback is a business rule, not a persistence concern,
so it belongs in the application layer, not baked into the infrastructure adapter. The port
(`findByRole`) stays a mechanical, single-role query (see the `validator-candidate-repository-port`
spec); this use case is the only caller that knows about the fallback.

## ADDED Requirements

### Requirement: FindValidatorCandidatesUseCase resolves tenant-scoped validators, excluding the acting user

`FindValidatorCandidatesUseCase.execute(tenantId, excludingUserId)` SHALL call
`IValidatorCandidateRepository.findByRole(tenantId, "data-validator", excludingUserId)` and resolve
that result when it is non-empty, mirroring legacy's own `getUserCountryAccountsWithValidatorRole`
call and its exclusion of the current user (`new.tsx` lines 67-76).

#### Scenario: Validators exist — resolved directly, no fallback call made

- **GIVEN** a tenant with two users holding the `"data-validator"` role (excluding
  `excludingUserId`)
- **WHEN** `execute(tenantId, excludingUserId)` is called
- **THEN** it SHALL resolve exactly those two validators
- **AND** `findByRole` SHALL NOT have been called with `"admin"`

### Requirement: An empty validator list falls back to tenant admins, same self-exclusion applied

When `findByRole(tenantId, "data-validator", excludingUserId)` resolves an empty array,
`FindValidatorCandidatesUseCase.execute()` SHALL call
`findByRole(tenantId, "admin", excludingUserId)` and resolve that result instead — mirroring
legacy's own fallback (`new.tsx` lines 79-84). This branching logic SHALL live only in this use
case, never in `IValidatorCandidateRepository` or its Drizzle adapter.

#### Scenario: No validators exist — falls back to admins, excluding the acting user

- **GIVEN** a tenant with zero users holding the `"data-validator"` role (excluding
  `excludingUserId`), and two users holding the `"admin"` role, one of which is `excludingUserId`
- **WHEN** `execute(tenantId, excludingUserId)` is called
- **THEN** it SHALL resolve exactly the one admin that is not `excludingUserId`

#### Scenario: The only validator is the acting user — falls back to admins

- **GIVEN** a tenant with exactly one `"data-validator"`-role user, who is `excludingUserId`
- **WHEN** `execute(tenantId, excludingUserId)` is called
- **THEN** the resolved list SHALL NOT include `excludingUserId`
- **AND** it SHALL instead resolve the tenant's admin-role users (excluding `excludingUserId`),
  not an empty list

#### Scenario: No validators and no admins resolves an empty list, not an error

- **GIVEN** a tenant with zero `"data-validator"`-role users and zero `"admin"`-role users
  (excluding `excludingUserId`)
- **WHEN** `execute(tenantId, excludingUserId)` is called
- **THEN** it SHALL resolve an empty array, not reject
