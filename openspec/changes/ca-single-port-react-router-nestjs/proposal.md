## Why

Frontend and backend currently run on separate ports. This adds deployment complexity and cross-origin concerns, and makes local development less straightforward.

We want one HTTP endpoint while keeping clear boundaries:

- `/api/*` handled by NestJS
- non-API routes handled by React Router

## What Changes

- Compose a single HTTP server for API and frontend traffic.
- Mount NestJS under `/api` on a supplied Express instance.
- Mount React Router handler as terminal catch-all for non-API requests.
- Keep health/readiness endpoints on the same server.
- Update scripts/config/docs for single-port operation.

## Impact

### Affected specs
- `nestjs-http-server-bootstrap`
- `hazardous-event-route-adapter`

### Affected code
- Server bootstrap/composition
- Route registration order
- Dev/prod startup scripts
- Integration/smoke tests
