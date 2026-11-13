# hazardous-events-guards Specification

## Purpose
Exposes authentication and authorization guards within the Hazardous Events bounded context presentation layer for use by upcoming REST controllers.

## Requirements

### Requirement: Presentation guard facade
`app/domains/hazardous-events/presentation/guards/index.ts` SHALL re-export `ApiKeyAuthGuard`, `SessionAuthGuard`, `ApiKeyOrSessionAuthGuard`, `PermissionsGuard`, `RequirePermission`, and `AuthenticatedRequest`.

#### Scenario: Domain controller import
- **WHEN** `HazardousEventsController` imports guards from `./guards` or `~/domains/hazardous-events/presentation/guards`
- **THEN** all authentication and authorization guards are cleanly resolvable
