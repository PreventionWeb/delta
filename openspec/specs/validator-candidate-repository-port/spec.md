# validator-candidate-repository-port Specification

## Purpose

Defines `IValidatorCandidateRepository`, the port that resolves a tenant's users holding a single
role, for the `submit-validation` workflow action — an entity-type-agnostic, shared concern living
in `validation-workflow`'s own application layer (alongside `INotificationPort`). This port is a
mechanical query only: the validator-then-admin-fallback policy is owned by
`FindValidatorCandidatesUseCase` (see the `find-validator-candidates` spec), not this port (SOLID
review, DIP finding — the fallback business rule does not belong in the infrastructure adapter).

## Requirements

### Requirement: findByRole returns tenant-scoped users holding the given role, excluding the acting user

`IValidatorCandidateRepository.findByRole(tenantId, role, excludingUserId)` SHALL resolve the set of
users holding `role` (`"data-validator"` or `"admin"`) for `tenantId`, excluding the user identified
by `excludingUserId`, mirroring legacy's `getUserCountryAccountsWithValidatorRole` /
`getUserCountryAccountsWithAdminRole` calls and their own exclusion of the current user (`new.tsx`
lines 67-84). `findByRole` SHALL NOT apply any fallback between roles — it resolves exactly the
role it is called with, nothing else.

#### Scenario: Validators for the tenant are returned, excluding the acting user

- **GIVEN** a tenant with three users holding the `"data-validator"` role, one of which is
  `excludingUserId`
- **WHEN** `findByRole(tenantId, "data-validator", excludingUserId)` is called
- **THEN** it SHALL resolve exactly the two validators that are not `excludingUserId`

#### Scenario: Admins for the tenant are returned, excluding the acting user

- **GIVEN** a tenant with two users holding the `"admin"` role, one of which is `excludingUserId`
- **WHEN** `findByRole(tenantId, "admin", excludingUserId)` is called
- **THEN** it SHALL resolve exactly the one admin that is not `excludingUserId`

#### Scenario: Validators from a different tenant are never returned

- **GIVEN** a user holding the `"data-validator"` role under a different tenant than `tenantId`
- **WHEN** `findByRole(tenantId, "data-validator", excludingUserId)` is called
- **THEN** that other-tenant user SHALL NOT appear in the resolved list

#### Scenario: No users hold the given role resolves an empty list, not an error

- **GIVEN** a tenant with zero users holding `"data-validator"` (excluding `excludingUserId`)
- **WHEN** `findByRole(tenantId, "data-validator", excludingUserId)` is called
- **THEN** it SHALL resolve an empty array, not reject

#### Scenario: findByRole never substitutes one role's results for another

- **GIVEN** a tenant with zero users holding the `"data-validator"` role and two users holding the
  `"admin"` role
- **WHEN** `findByRole(tenantId, "data-validator", excludingUserId)` is called
- **THEN** it SHALL resolve an empty array
- **AND** it SHALL NOT resolve the tenant's admin-role users — that branching is
  `FindValidatorCandidatesUseCase`'s responsibility, not this port's
