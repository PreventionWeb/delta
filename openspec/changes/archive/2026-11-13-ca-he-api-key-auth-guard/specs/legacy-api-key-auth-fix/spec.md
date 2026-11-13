# legacy-api-key-auth-fix Specification

## Purpose
Ensures that legacy `apiAuth` returns a proper HTTP 401 Response on invalid API key credentials instead of crashing with an unhandled TypeError.

## Requirements

### Requirement: apiAuth rejects empty key lookup with 401
In `app/backend.server/models/api_key.ts`, `apiAuth` SHALL throw an HTTP 401 `Response("Unauthorized", { status: 401 })` when `ApiKeyRepository.getBySecret()` resolves to an empty array (`[]`).

#### Scenario: Non-existent secret token
- **GIVEN** a request with header `X-Auth: non-existent-secret`
- **WHEN** `ApiKeyRepository.getBySecret` returns an empty array `[]`
- **THEN** `apiAuth` throws a `Response` with status 401 and statusText "Unauthorized"

#### Scenario: Missing X-Auth header
- **GIVEN** a request with no `X-Auth` header
- **WHEN** `apiAuth` is called
- **THEN** `apiAuth` throws a `Response` with status 401 and statusText "Unauthorized"

#### Scenario: Valid secret token
- **GIVEN** a request with header `X-Auth: valid-secret`
- **WHEN** `ApiKeyRepository.getBySecret` returns `[validKeyRow]`
- **THEN** `apiAuth` returns `validKeyRow`
