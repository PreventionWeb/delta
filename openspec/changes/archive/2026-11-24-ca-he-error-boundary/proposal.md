## Why

Every `he-preview` route (CA Hazardous Events, Phase 6) has no route-level `ErrorBoundary`, so any
thrown error escapes to the root boundary in `app/root.tsx`. Observed live (dev mode,
2026-11-23): a missing event renders a full-page "404 / [object Object]" card with no app header
or navigation, and a malformed (non-UUID) id renders a 500 with the raw SQL query text, because
Postgres error `22P02` reaches the presentation layer unmapped (ADR-003 Rule 2 violation; archived
6l design.md known limitation F). Roadmap intent `6b` closes both gaps before Phase 7 cutover.

The user also enrolled one related fix (OD-7, 2026-11-23): the ADR-003 error envelope must stop
copying raw `DomainError.context` into `details`, because it leaks ids and tenant ids to clients.

## What Changes

- New `HazardousEventErrorBoundary` web adapter at
  `app/domains/hazardous-events/presentation/web/HazardousEventErrorBoundary.tsx`, exported as
  `ErrorBoundary` from `_index`, `$id`, `new`, `edit.$id` and `picker` (not `delete.$id`, OD-10).
  It narrows on `isRouteErrorResponse` first, shows status-keyed translated copy, a copyable error
  reference and a back link inside the app layout, and a generic fallback for non-Response
  errors. It never renders `error.message`, stacks, `details` or SQL text. Styled with HE's
  legacy-parity set `app/design-system/components/` (`ui-classification: legacy-exempt`, OD-1).
- New pure presentation mapper `mapRouteErrorToView` (status to message keys, safe traceId).
- Infrastructure: `DrizzleHazardousEventRepository` `findById`/`findByIdForUpdate` reject a
  malformed (non-UUID) id with `NotFoundError` before querying, and `delete` treats it as its
  existing no-match no-op (OD-2 A, revised in rounds 2 and 3: no 22P02 catch, so a malformed
  `tenantId` still surfaces as a driver error). List/picker filters already ignore
  malformed ids and are unchanged.
- Route loaders/actions load the `hazardous-events` and `common` namespaces before anything can
  throw.
- `throwHazardousEventLoaderError` turns a non-`DomainError` failure into an ADR-003
  `INTERNAL_ERROR` 500 envelope with the request `traceId` (OD-4), and the previously unwrapped
  route awaits are routed through it (OD-11). **Replaces an existing requirement** of
  `hazardous-event-route-adapter`.
- **Envelope `details` (OD-7, ED-1 to ED-3):** a new shared `toErrorResponseDetails` rule sends
  only `{ field }` from a `ValidationError`; every other `DomainError` sends no `details`; dropped
  context is not logged. Applied to the HE web helper, the Notices web helper and the **shared**
  `DomainErrorFilter` (all NestJS REST controllers; today `/api/v2/notices`).
- A header README in `app/design-system/components/` stating it is the HE legacy-parity set, not
  for new screens, and removed at the HE UI upgrade (documentation only).
- New EN/FR keys in `locales/{en,fr}/hazardous-events.json` under `error.*`.
- `BackLink` (detail page and error boundary) text and border colour move from legacy
  `blue-500` (fails WCAG 1.4.3) to the existing `--color-dts-action` token (round 2, B1).
- Deferred-register rows DEF-062 (back-link focus ring, app-wide) and DEF-063 (duplicate submit
  after a committed create).
- Not changed: `app/design-system/ui/`, `AccessManagementPage` and the `design-system-components`
  requirements (PR #840); the folder merge belongs to DEF-014's assigned team member. The
  pre-existing raw `#666` in `HazardousEventListPage.tsx` stays (legacy-exempt).

## Capabilities

### New Capabilities

- `hazardous-event-error-boundary`: what a user sees when any he-preview page fails, the error
  reference, localisation, layout and accessibility of that state.

### Modified Capabilities

- `hazardous-event-repository-port`: read-by-id methods treat a malformed id as not found.
- `hazardous-event-route-adapter`: 500 envelope for unexpected errors; namespaces load first;
  `details` limited to field-level validation.
- `notices-route-adapter`: `details` limited to field-level validation.
- `domain-error-filter`: `details` limited to field-level validation (shared REST filter).

## Impact

Files expected to change:

- HE web: `HazardousEventErrorBoundary.tsx` (new), `mapRouteErrorToView.ts` (new),
  `throwHazardousEventLoaderError.server.ts`.
- HE infrastructure: `DrizzleHazardousEventRepository.server.ts` (malformed id),
  `isWellFormedUuid.ts` (new).
- HE web: `BackLink.tsx` (colour token, round 2).
- Routes: `app/routes/$lang+/_authenticated+/he-preview+/{_index,$id,new,edit.$id,picker}.tsx`.
- Shared: `app/shared/errors/toErrorResponseDetails.ts` (new), `app/shared/errors/index.ts`,
  `app/infrastructure/DomainErrorFilter.server.ts`.
- Notices: `app/domains/notices/presentation/throwNoticeLoaderError.server.ts`.
- Docs: `app/design-system/components/README.md` (new).
- Locales: `locales/{en,fr}/hazardous-events.json`.
- Tests: repository, use-case and route tests under `tests/integration/`;
  `tests/integration/nestjs/DomainErrorFilter.test.ts`; Notices route tests; new unit, DOM and
  E2E files.

DB migration: **none**.

Test approach: unit (Vitest) for the pure mapper and the details rule; DOM (jsdom) for the
boundary; PGlite (`yarn test:run2`) for the repository, routes, Notices loaders and REST filter;
Playwright E2E (`yarn test:e2e`) for the boundary with axe WCAG 2.2 AA via
`tests/e2e/helpers/a11y.ts`; Stryker scoped to changed `app/domains/**` logic files.

Security / multi-tenancy: **security-sensitive (information disclosure).** Removes a live SQL-text
leak (dev) and stops sending raw error context (ids, tenant ids) to clients on every surface. A
cross-tenant id stays indistinguishable from a missing id (404). No tenant scoping changes.
**Externally visible API change:** `/api/v2/notices` not-found/conflict responses lose `details`.

UI classification: `legacy-exempt` (OD-1): HE keeps legacy styling by agreement until the
"HE UI upgrade to the new design system" iteration. The design-system pin and the feature-prototype
`not-required` exception (OD-6) are recorded in design.md. WCAG 2.2 AA still applies in full.
