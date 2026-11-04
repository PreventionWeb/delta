## ADDED Requirements

### Requirement: Unified HTTP Server Bootstrap
The application SHALL expose one HTTP listener for API and frontend traffic.

#### Scenario: Unified startup
- **WHEN** the application starts
- **THEN** one server port is used for both API and frontend requests

### Requirement: Unified Health and Readiness Endpoints
The unified server SHALL expose health and readiness endpoints.

#### Scenario: Health check
- **WHEN** `/healthz` is requested
- **THEN** the server returns a health response

#### Scenario: Readiness check
- **WHEN** `/readyz` is requested
- **THEN** the server returns a readiness response
