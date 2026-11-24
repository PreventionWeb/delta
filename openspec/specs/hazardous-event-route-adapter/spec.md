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
not a positive integer, it MUST default to `50`, matching legacy's `pagination/api.server.ts`
`DEFAULT_PAGE_SIZE`. `pageSize` MUST be clamped to a maximum of `100` regardless of the requested
value.

#### Scenario: No pagination query params supplied

- **WHEN** the request URL has no `page` or `pageSize` query parameter
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 50`

#### Scenario: Malformed pagination query params

- **WHEN** the request URL is `?page=abc&pageSize=xyz`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `page: 1, pageSize: 50`

#### Scenario: pageSize exceeds the maximum

- **WHEN** the request URL is `?pageSize=500`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with `pageSize: 100`

### Requirement: HE list and detail loaders return plain data on success, with no envelope

When the resolved use case's `execute()` resolves, the loader SHALL return that value directly.
It MUST NOT wrap the result in a `{ success: true, data }` envelope or any other wrapper object
(ADR-007).

#### Scenario: Successful fetch from the list loader

- **WHEN** `ListHazardousEventsUseCase.execute()` resolves with `{ items, totalCount,
unfilteredTotalCount }`
- **AND** `GetHazardTaxonomyOptionsUseCase.execute()` resolves with a `HazardTaxonomyOptions` value
- **THEN** the list loader's return value MUST be `{ items, totalCount, unfilteredTotalCount,
taxonomyOptions, role }`, where `taxonomyOptions` is that same `HazardTaxonomyOptions` value and
  `role` is `requireViewDataPermission`'s own resolved role (string or `null`), included so
  `HazardousEventFilterBar` can receive it as a prop without a second permission/role lookup
- **AND** the return value MUST NOT have a `success` property

#### Scenario: Successful fetch from the detail loader

- **WHEN** `GetHazardousEventByIdUseCase.execute()` resolves with a `HazardousEventDetailDto`
- **THEN** the detail loader's return value MUST be that same object
- **AND** the return value MUST NOT have a `success` property

### Requirement: HE list and detail loaders throw a structured error response for a DomainError

Each loader SHALL throw `Response.json(errorResponse, { status: err.statusHint })` when its
resolved use case's `execute()` rejects with an instance of `DomainError`, where `errorResponse`
follows the ADR-003 envelope: `{ success: false, error: { code, message, details?, traceId,
timestamp } }`. `details` MUST be present only when `err` is a `ValidationError` whose `context`
has a string `field` property, and MUST then equal exactly `{ field }`; for every other
`DomainError`, and for a `ValidationError` without a string `field`, `details` MUST be absent, and
no `context` property other than `field` MAY be copied into the body. `message` is the error's own
message and is not affected by this requirement. `traceId` MUST be
`getRequestContext()?.traceId` when a request-context store is active, or a freshly generated UUID
otherwise.

#### Scenario: Detail loader — unknown or cross-tenant id

- **WHEN** `GetHazardousEventByIdUseCase.execute()` rejects with `NotFoundError` for an id that
  does not exist, or exists under a different tenant
- **THEN** the detail loader MUST throw a `Response` with status `404`
- **AND** the thrown response body's `error.code` MUST equal `"NOT_FOUND"`
- **AND** the thrown response body MUST NOT have an `error.details` property
- **AND** the body MUST NOT contain the requested id

#### Scenario: List loader — a DomainError with context

- **WHEN** `ListHazardousEventsUseCase.execute()` rejects with `new ValidationError("bad query", { field: "page" })`
- **THEN** the thrown response body's `error.details` MUST equal `{ field: "page" }`

#### Scenario: Extra context keys on a ValidationError are dropped

- **WHEN** a loader's use case rejects with `new ValidationError("bad", { field: "page", tenantId: "t-1", sql: "select 1" })`
- **THEN** `error.details` MUST equal `{ field: "page" }`
- **AND** the body MUST NOT contain `"t-1"` or `"select 1"`

#### Scenario: Conflict context is never sent

- **WHEN** a loader or action handles `new ConflictError("x", { id: "he-1", tenantId: "t-1", reason: "OTHER" })`
- **THEN** the thrown response body MUST NOT have an `error.details` property

#### Scenario: traceId is sourced from the active request context

- **WHEN** either loader's use case rejects with a `DomainError`
- **AND** `getRequestContext()` returns a store with `traceId: "trace-123"`
- **THEN** the thrown response body's `error.traceId` MUST equal `"trace-123"`

### Requirement: HE list loader parses filter query params and forwards them to the use case

The list loader SHALL parse the filter query params described in the `hazardous-event-list-filters`
capability via `parseHazardousEventListFilters`, and pass the resulting object as
`ListHazardousEventsUseCase.execute`'s `filters` field, alongside the already-resolved
`tenantId`/`page`/`pageSize`/`userId`/`role`.

#### Scenario: Filter query params are forwarded to the use case

- **WHEN** the request URL is `?hazardTypeId=t1&recordStatus=SUBMITTED`
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with a `filters` field whose
  `hazardTypeId` is `"t1"` and whose `recordStatus` is `"SUBMITTED"`

#### Scenario: No filter query params supplied

- **WHEN** the request URL has no filter query params
- **THEN** `ListHazardousEventsUseCase.execute` MUST be called with a `filters` field equivalent
  to "no filter applied"

### Requirement: HE list loader resolves taxonomy options via a dedicated use case, not the repository directly

The list loader SHALL call `GetHazardTaxonomyOptionsUseCase.execute()` (alongside
`ListHazardousEventsUseCase.execute()`, both resolved via `getAppContext().get(...)`) to obtain
the data backing the filter bar's cascading combobox, rather than calling
`ISpecificHazardTaxonomyRepository` directly — preserving the thin-loader rule (no direct
repository access from a route file).

#### Scenario: List loader calls the taxonomy use case

- **WHEN** the list loader runs successfully
- **THEN** `GetHazardTaxonomyOptionsUseCase.execute` MUST be called exactly once
- **AND** its resolved value MUST be included in the loader's own return value as
  `taxonomyOptions`

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

### Requirement: HE detail loader resolves and returns the acting role

The `loader` exported from `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` SHALL continue
to call `requireViewDataPermission({ request })` for its authorization side-effect (a real
`ViewData` gate, shared with the list loader), but SHALL NOT capture its return value or include a
`role` field in the loader's return value. This reverses the "Captured (was previously discarded)"
change made by a different, already-archived change
(`2026-11-04-ca-he-route-adapter-write`, design.md Decision 16) to feed the Edit/add-cause links
the two Requirements below now remove.

#### Scenario: Detail loader returns the resolved role alongside the event

- **GIVEN** an authenticated session with `ViewData` permission and role `"data-collector"`
- **WHEN** the detail loader runs for an existing, tenant-scoped event
- **THEN** `requireViewDataPermission({ request })` SHALL still have resolved and authorized that
  role (its 403-on-missing-permission behavior is unchanged)
- **AND** the loader's return value SHALL NOT include a `role` field alongside the event (title
  retained from the superseded requirement for delta continuity; the behavior is now the opposite
  of what the title describes literally — see the Requirement text above)

### Requirement: HE detail page renders an "Edit" link, gated by EditData AND the same status-aware check the edit route's own loader enforces

`HazardousEventDetailPage` SHALL NOT render a link to `he-preview/edit/{id}`, for any role or
`workflowStatus`. This reverses the Requirement of the same name added by
`2026-11-04-ca-he-route-adapter-write` (design.md Decision 16): a fresh manual review against
legacy's real current detail page (`app/frontend/events/hazardeventform.tsx`'s
`HazardousEventView`, `hideEditButton={true}` at line 693, honored unconditionally by
`app/frontend/components/data-collection/View.tsx:624`) found legacy has no Edit link on this page
at all — Edit remains reachable from the Hazardous events list page's own row actions instead.
Every scenario below (titles retained from the superseded requirement for delta continuity) now
asserts the link is absent in the case it used to assert the link was present.

#### Scenario: A role with EditData sees the Edit link for an editable status (DRAFT)

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"data-collector"`)
  and `data.workflowStatus: "DRAFT"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A role with EditData sees the Edit link for REVISION_REQUESTED

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"admin"`) and
  `data.workflowStatus: "REVISION_REQUESTED"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A role with EditData never sees the Edit link for a locked status

- **GIVEN** a detail page rendered with `role: "admin"` and `data.workflowStatus` one of
  `"SUBMITTED"`, `"APPROVED"`, `"PUBLISHED"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: data-viewer never sees the Edit link

- **GIVEN** a detail page rendered with `role: "data-viewer"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

#### Scenario: A null/missing role never sees the Edit link

- **GIVEN** a detail page rendered with `role: null`
- **WHEN** the page renders
- **THEN** no link to `he-preview/edit/{id}` SHALL be present

### Requirement: HE detail page renders an "Add hazardous event caused by this event" link, gated the same way

`HazardousEventDetailPage` SHALL NOT render a link to `he-preview/new?parent={id}`, for any role.
This reverses the Requirement of the same name added by `2026-11-04-ca-he-route-adapter-write`
(design.md Decision 16): a fresh manual review against legacy's real current detail page found no
equivalent entry point for this link anywhere on the page's redesign. The route at
`he-preview/new.tsx` and its `?parent=` query-param handling are unchanged and still function if
reached directly by URL — only the in-app link to it from this page is removed. Both scenarios
below (titles retained from the superseded requirement for delta continuity) now assert the link
is absent in the case that used to assert it was present.

#### Scenario: A role with EditData sees the add-cause link

- **GIVEN** a detail page rendered for a role with `EditData` permission (e.g. `"admin"`) for
  event id `"evt-1"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/new?parent=evt-1` SHALL be present

#### Scenario: data-viewer never sees the add-cause link

- **GIVEN** a detail page rendered with `role: "data-viewer"`
- **WHEN** the page renders
- **THEN** no link to `he-preview/new?parent={id}` SHALL be present

### Requirement: HE detail page renders attachments as a Title/Tags/File-URL table

`HazardousEventDetailPage` SHALL render a non-empty `data.attachments` collection as a table with
exactly three columns, in this order: Title, Tags, File/URL — built from the design-system
`Table`/`TableColumn`/`TableRow`/`TableCell` components, matching legacy's own equivalent
read-only view (`app/frontend/attachmentsView.tsx`) with the deviations stated below. This
replaces the previous title-only `<ul>`/`<li>` rendering. The existing empty-state branch
(`data.attachments.length === 0` renders `t("detail.attachments_none")`) SHALL be unchanged.

#### Scenario: A non-empty attachments collection renders as a table, not a list

- **GIVEN** a detail page rendered with one or more attachments
- **WHEN** the page renders
- **THEN** the attachments SHALL render inside a table with column headers for Title, Tags, and
  File/URL
- **AND** no bare `<ul>`/`<li>` attachments markup SHALL be present

#### Scenario: The empty-attachments state is unchanged

- **GIVEN** a detail page rendered with `data.attachments: []`
- **WHEN** the page renders
- **THEN** the translated string for `detail.attachments_none` SHALL be present
- **AND** no attachments table SHALL be rendered

### Requirement: An attachment's tags render joined by name, with a dash fallback

Each attachment row's Tags cell SHALL render `attachment.tag`'s entries joined by their `name`
field, comma-separated. When `attachment.tag` is `null` or an empty array, the cell SHALL render
`"—"`, matching this same page's own existing convention for a null nullable field (not legacy's
`"N/A"` string).

#### Scenario: An attachment with tags renders them joined by name

- **GIVEN** an attachment with `tag: [{id: "t1", name: "Flood"}, {id: "t2", name: "Urban"}]`
- **WHEN** the page renders
- **THEN** the attachment's Tags cell SHALL contain "Flood, Urban"

#### Scenario: An attachment with no tags renders a dash

- **GIVEN** an attachment with `tag: null`
- **WHEN** the page renders
- **THEN** the attachment's Tags cell SHALL contain "—"
- **AND** the cell SHALL NOT contain "N/A"

### Requirement: A File-type attachment renders a working download link using fileKey for the href and fileName for the display text

A `type: "File"` attachment's File/URL cell SHALL render an `<a>` element whose `href` resolves
to the existing `/hazardous-event/file-viewer` route with a `name` query value built from the
event's own `id` and the attachment's `fileKey` (the on-disk basename), and whose visible text
is `attachment.fileName` (the human-readable display name) — never the reverse. The link SHALL
carry `target="_blank" rel="noopener noreferrer"`.

#### Scenario: A File-type attachment's link targets fileKey and displays fileName

- **GIVEN** a detail page rendered for event id `"evt-1"` with an attachment
  `{type: "File", fileKey: "abc123__survey.jpg", fileName: "survey.jpg"}`
- **WHEN** the page renders
- **THEN** the rendered `<a>` element's `href` SHALL contain `evt-1/abc123__survey.jpg`
- **AND** the rendered `<a>` element's visible text SHALL be "survey.jpg"
- **AND** the `<a>` element SHALL have `target="_blank"` and `rel="noopener noreferrer"`

### Requirement: A Link-type attachment renders a working hyperlink to its URL

A `type: "Link"` attachment's File/URL cell SHALL render an `<a>` element whose `href` is
`attachment.url` and whose visible text is `attachment.url`, carrying
`target="_blank" rel="noopener noreferrer"`.

#### Scenario: A Link-type attachment's link targets its own url

- **GIVEN** an attachment `{type: "Link", url: "https://example.org/report"}`
- **WHEN** the page renders
- **THEN** the rendered `<a>` element's `href` SHALL be "https://example.org/report"
- **AND** the `<a>` element SHALL have `target="_blank"` and `rel="noopener noreferrer"`

### Requirement: HE route loaders and actions turn a non-DomainError failure into a generic 500 error envelope

When a he-preview loader or action (list, detail, create, edit, picker, and the delete action's
unexpected-error path) handles a failure that is not an instance of `DomainError` and not a thrown
`Response`, it SHALL log the failure at `error` level with the error and the request URL, and
SHALL then throw an HTTP 500 response whose body is the ADR-003 envelope
`{ success: false, error: { code: "INTERNAL_ERROR", message, traceId, timestamp } }`. `message`
SHALL be a fixed generic text that contains nothing from the original error. `details` SHALL be
absent. `traceId` SHALL be the active request context's `traceId` when one exists, or a freshly
generated UUID otherwise. A thrown `Response` (for example a redirect) SHALL propagate unchanged.

#### Scenario: Use case throws a plain Error

- **WHEN** the detail loader's use case rejects with `new Error("DB connection lost")`
- **THEN** the error logger SHALL be called exactly once with that error and the request URL
- **AND** the loader SHALL throw a Response with status 500
- **AND** the body's `error.code` SHALL equal `"INTERNAL_ERROR"`
- **AND** the body SHALL NOT contain "DB connection lost" anywhere
- **AND** the body SHALL NOT have a `details` property

#### Scenario: traceId comes from the request context

- **WHEN** a loader's use case rejects with a plain `Error`
- **AND** the active request context has `traceId: "trace-500"`
- **THEN** the thrown body's `error.traceId` SHALL equal `"trace-500"`
- **AND** the logged record SHALL carry the same `traceId`

#### Scenario: A thrown redirect is not converted

- **WHEN** the value handled is a `Response` with status 302
- **THEN** that same `Response` SHALL propagate unchanged and nothing SHALL be logged at `error`

#### Scenario: Concurrent failing requests keep their own trace ids

- **WHEN** two requests with request-context trace ids "trace-a" and "trace-b" fail with plain errors at the same time
- **THEN** the response for the first SHALL carry "trace-a" and the response for the second "trace-b"

### Requirement: HE UI route loaders load their translation namespaces before any check can fail

The list, detail, create, edit and picker loaders, and the create and edit actions, SHALL load the
`hazardous-events` and `common` translation namespaces for the request language before running
any authentication, tenant, permission or use-case step that can throw, so that an error state
rendered for that request is fully translated.

#### Scenario: Permission failure still has translations loaded

- **GIVEN** a signed-in user whose role lacks ViewData
- **WHEN** the detail loader runs for `/fr/he-preview/<uuid>`
- **THEN** it SHALL throw a 403 error response
- **AND** the request's i18n instance SHALL already have the French `hazardous-events` namespace loaded

#### Scenario: Not-found on edit still has translations loaded

- **WHEN** the edit loader runs for a UUID with no event in the user's tenant
- **THEN** it SHALL throw a 404 error response
- **AND** the request's i18n instance SHALL already have the `hazardous-events` namespace loaded

#### Scenario: Unauthenticated request still redirects

- **WHEN** any of these loaders runs without a signed-in session
- **THEN** it SHALL redirect to the login page exactly as before
