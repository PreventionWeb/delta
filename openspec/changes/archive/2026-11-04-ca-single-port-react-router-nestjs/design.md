## Context

React Router documents custom server hosting with `@react-router/express`, but not NestJS composition. NestJS supports running on a supplied Express instance; Express supports mounting sub-apps.

## Decision

Use Express as root server:

1. Root server owns `listen()`.
2. Initialize NestJS on supplied Express instance with `init()` (no `listen()`), mount at `/api`.
3. Register React Router as terminal catch-all for all non-API routes.

## Route Contract

Registration order:

1. `/healthz`, `/readyz`
2. `/api` (NestJS)
3. static assets (if applicable)
4. React Router catch-all

## Notes

- Use `getLoadContext` for sharing server-side use-cases with loaders/actions.
- Validate SSR streaming with compression middleware.
- Ensure graceful shutdown order: readiness off → HTTP drain → `nest.close()`.
