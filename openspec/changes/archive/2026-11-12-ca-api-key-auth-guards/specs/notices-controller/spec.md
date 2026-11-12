# Spec Delta

## MODIFIED Requirements

### Requirement: All five endpoints require authentication

Every `NoticesController` route SHALL be guarded by `ApiKeyOrSessionAuthGuard`. Requests without a
valid API key or session cookie MUST receive `401` before any use case executes.

#### Scenario: Unauthenticated request to any endpoint returns 401

- **WHEN** a request with no valid session cookie or API key hits any of `GET /notices`, `GET
/notices/:id`, `POST /notices`, `PUT /notices/:id`, or `DELETE /notices/:id`
- **THEN** the response status is `401`
- **AND** the corresponding use case is never invoked
