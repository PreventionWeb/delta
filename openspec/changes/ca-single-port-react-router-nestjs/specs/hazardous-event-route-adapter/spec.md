## ADDED Requirements

### Requirement: API Route Boundary
The system SHALL reserve `/api/*` for NestJS handling.

#### Scenario: API route request
- **WHEN** request path starts with `/api/`
- **THEN** request is handled by NestJS
- **AND** not delegated to React Router

### Requirement: Frontend Route Delegation
The system SHALL delegate non-API routes to React Router server handling.

#### Scenario: Frontend route request
- **WHEN** request path does not start with `/api/`
- **THEN** request is handled by React Router
- **AND** deep-link routes resolve successfully

### Requirement: API-First Route Precedence
The server SHALL register API routes before React Router catch-all routes.

#### Scenario: Route registration
- **WHEN** handlers are mounted
- **THEN** `/api` routes are mounted before catch-all handling
- **AND** catch-all does not intercept `/api/*`
