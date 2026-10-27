# hazardous-event-route-adapter Specification

## Purpose

Thin React Router loaders exposing `ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase`
through a new, authenticated, direct-URL-only (no nav link) web route family, and the page
components that render their results — the first Clean Architecture presentation surface for
Hazardous Events.

## Requirements

### Requirement: HE list loader resolves tenant from request context

The `loader` exported from `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` SHALL
resolve the current tenant by reading `getRequestContext()?.tenantId`. When that value is absent
(`undefined` or `null`), the loader MUST fall back to `getCountryAccountsIdFromSession(request)`.
When neither source yields a tenant id, the loader MUST throw a redirect to
`/${lang}/user/select-instance`, where `${lang}` is the current route's `params.lang`.

#### Scenario: Request context already has a tenantId

- **WHEN** the list loader runs and `getRequestContext()` returns a store with
  `tenantId: "tenant-A"`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `tenantId: "tenant-A"`
- **AND** `getCountryAccountsIdFromSession` MUST NOT be called

#### Scenario: Request context is absent, session has a tenant

- **WHEN** the list loader runs with no active request-context store
- **AND** `getCountryAccountsIdFromSession(request)` resolves to `"tenant-B"`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `tenantId: "tenant-B"`

#### Scenario: No tenant available from either source

- **WHEN** the list loader runs with no active request-context store
- **AND** `getCountryAccountsIdFromSession(request)` resolves to `null`
- **THEN** the loader MUST throw a redirect `Response` to `/${lang}/user/select-instance`
- **AND** `ListHazardousEventsUseCase.execute` MUST NOT be called

### Requirement: HE list loader reads pagination from the URL query string with safe defaults

The list loader SHALL parse `page` and `pageSize` from the request URL's query string. When
`page` is absent or not a positive integer, it MUST default to `1`. When `pageSize` is absent or
not a positive integer, it MUST default to `20`. `pageSize` MUST be clamped to a maximum of `100`
regardless of the requested value.

#### Scenario: No pagination query params supplied

- **WHEN** the request URL has no `page` or `pageSize` query parameter
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 20`

#### Scenario: Malformed pagination query params

- **WHEN** the request URL is `?page=abc&pageSize=xyz`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 20`

#### Scenario: pageSize exceeds the maximum

- **WHEN** the request URL is `?pageSize=500`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `pageSize: 100`

### Requirement: HE list and detail loaders return plain data on success, with no envelope

When the resolved use case's `execute()` resolves, the loader SHALL return that value directly.
It MUST NOT wrap the result in a `{ success: true, data }` envelope or any other wrapper object
(ADR-007).

#### Scenario: Successful fetch from the list loader

- **WHEN** `ListHazardousEventsUseCase.execute()` resolves with an array of
  `HazardousEventListItemDto` objects
- **THEN** the list loader's return value MUST be that same array
- **AND** the return value MUST NOT have a `success` property

#### Scenario: Successful fetch from the detail loader

- **WHEN** `GetHazardousEventByIdUseCase.execute()` resolves with a `HazardousEventDetailDto`
- **THEN** the detail loader's return value MUST be that same object
- **AND** the return value MUST NOT have a `success` property

### Requirement: HE list and detail loaders throw a structured error response for a DomainError

Each loader SHALL throw `Response.json(errorResponse, { status: err.statusHint })` when its
resolved use case's `execute()` rejects with an instance of `DomainError`, where `errorResponse`
follows the ADR-003 envelope: `{ success: false, error: { code, message, details?, traceId,
timestamp } }`. `details` MUST be present only when `err.context` is not `undefined`. `traceId`
MUST be `getRequestContext()?.traceId` when a request-context store is active, or a freshly
generated UUID otherwise.

#### Scenario: Detail loader — unknown or cross-tenant id

- **WHEN** `GetHazardousEventByIdUseCase.execute()` rejects with `NotFoundError` for an id that
  does not exist, or exists under a different tenant
- **THEN** the detail loader MUST throw a `Response` with status `404`
- **AND** the thrown response body's `error.code` MUST equal `"NOT_FOUND"`

#### Scenario: List loader — a DomainError with context

- **WHEN** `ListHazardousEventsUseCase.execute()` rejects with a `DomainError` whose `context` is
  `{ field: "page" }`
- **THEN** the thrown response body's `error.details` MUST equal `{ field: "page" }`

#### Scenario: traceId is sourced from the active request context

- **WHEN** either loader's use case rejects with a `DomainError`
- **AND** `getRequestContext()` returns a store with `traceId: "trace-123"`
- **THEN** the thrown response body's `error.traceId` MUST equal `"trace-123"`

### Requirement: HE list and detail loaders log and rethrow non-DomainError failures

Each loader SHALL call `getPinoLogger().error(...)` and then rethrow the original error unmodified
when its use case's `execute()` rejects with a value that is not an instance of `DomainError`. The
logged record MUST include the error and the request URL. The loader MUST NOT construct an
`ErrorResponse` envelope for this case.

#### Scenario: Use case throws a plain Error

- **WHEN** a loader's resolved use case rejects with `new Error("DB connection lost")`
- **THEN** `getPinoLogger().error` MUST be called exactly once
- **AND** the loader MUST rethrow the same `Error` instance
- **AND** the loader MUST NOT throw a `Response.json` envelope

### Requirement: HE detail loader resolves a single event by route param

The `loader` exported from `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` SHALL call
`GetHazardousEventByIdUseCase.execute({ id: params.id, tenantId })` using the same
tenant-resolution rule as the list loader.

#### Scenario: Known id within the resolved tenant

- **WHEN** the detail loader runs with `params.id === "abc"` and a resolved `tenantId` of
  `"tenant-A"`
- **THEN** `GetHazardousEventByIdUseCase.execute` MUST be called with
  `{ id: "abc", tenantId: "tenant-A" }`

### Requirement: HE route files delegate rendering to PageProps components

Each route file's default export MUST call `useLoaderData()` exactly once and pass the result as
the `data` prop to a `PageProps<T>`-typed page component. Route files MUST NOT contain business
logic (tenant resolution, pagination math, error-envelope construction) inline in the component
body.

#### Scenario: List route file structure

- **WHEN** `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` is inspected
- **THEN** its default export MUST call `useLoaderData()` and render a page component with
  `data={loaderData}`

#### Scenario: Detail route file structure

- **WHEN** `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` is inspected
- **THEN** its default export MUST call `useLoaderData()` and render a page component with
  `data={loaderData}`

### Requirement: HE route files render inside MainContainer, consistent with the rest of the application

Each route file's default export SHALL wrap its page component in `MainContainer`
(`app/frontend/container.tsx`) with a `title` prop.

#### Scenario: List route wraps its page component in MainContainer

- **WHEN** `app/routes/$lang+/_authenticated+/he-preview+/_index.tsx` is inspected
- **THEN** its default export MUST render the list page component inside a `MainContainer` with a
  non-empty `title` prop

#### Scenario: Detail route wraps its page component in MainContainer

- **WHEN** `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` is inspected
- **THEN** its default export MUST render the detail page component inside a `MainContainer` with
  a non-empty `title` prop

### Requirement: The list page provides a way to reach each event's detail page

The list page component SHALL render, for each event in the data it receives, a link that
navigates to that event's own detail route — since Invariant 2 means neither page is reachable
from any navigation component, this in-page link is the only way a user reaches the detail view.

#### Scenario: Row action links to the correct detail route

- **WHEN** the list page receives data containing a `HazardousEventListItemDto` with `id: "abc"`
- **THEN** that row MUST render a link whose target is `/he-preview/abc`

### Requirement: A missing workflow status is visibly indicated, not hidden

Both the list and detail page components SHALL render a distinct, visible indicator (not a blank
cell, not an error) when an event's `workflowStatus` is `null`, matching `DEF-031`'s
graceful-degradation outcome rather than concealing it.

#### Scenario: List row with a null workflowStatus

- **WHEN** the list page receives data containing an item whose `workflowStatus` is `null`
- **THEN** that row's status indicator MUST render distinctly from every known `Status` value

#### Scenario: Detail page with a null workflowStatus

- **WHEN** the detail page receives data whose `workflowStatus` is `null`
- **THEN** the rendered page MUST render a distinct indicator for the missing status, not an
  empty or absent element

### Requirement: The new route is unreachable without an authenticated session and resolvable tenant

Neither route SHALL render event data for a request that cannot resolve both an authenticated
session and a tenant id — see "HE list loader resolves tenant from request context" above for the
tenant half of this guarantee.

#### Scenario: No session and no tenant resolvable

- **WHEN** either loader runs with no active request-context store and
  `getCountryAccountsIdFromSession(request)` resolves to `null`
- **THEN** the loader MUST throw a redirect, not return event data

### Requirement: Each loader requires the ViewData permission, checked directly, not inherited from the parent layout

Each loader SHALL call `requireUser()` and verify the resulting session has the `ViewData`
permission before calling its resolved use case. This check MUST be performed by the loader
itself, not assumed to have already been performed by the parent `_authenticated+` layout (React
Router's matched-route loaders run in parallel; the layout's own `requireUser` call does not gate
a child loader's execution). A session without `ViewData` SHALL be rejected with a structured
`ErrorResponse` whose `error.code` is `"FORBIDDEN"` and status is `403`, following the same
`DomainError` → `ErrorResponse` mapping used for every other error case.

#### Scenario: Authenticated session without ViewData permission

- **WHEN** either loader runs with a valid, authenticated session whose role does not have the
  `ViewData` permission
- **THEN** the loader MUST throw a `Response` with status `403`
- **AND** the thrown response body's `error.code` MUST equal `"FORBIDDEN"`
- **AND** the resolved use case (`ListHazardousEventsUseCase`/`GetHazardousEventByIdUseCase`)
  MUST NOT be called

#### Scenario: Authenticated session with ViewData permission

- **WHEN** either loader runs with a valid, authenticated session whose role has the `ViewData`
  permission, and a resolvable tenant
- **THEN** the loader MUST proceed to call its resolved use case normally

### Requirement: The new route is absent from every navigation component

No navigation component in the application SHALL reference the new route's path segment,
consistent with Invariant 2 (direct-URL-only access).

#### Scenario: Main navigation menu has no reference to the new route

- **WHEN** `app/components/RegularMenuBar.tsx` (and any other navigation component) is inspected
- **THEN** it MUST NOT contain any reference to the `he-preview` path segment
