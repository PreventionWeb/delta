## ADDED Requirements

### Requirement: Server-side i18next instance reads locale files from disk

The `createI18nextMiddleware` instance configured in `app/middleware/i18next.server.ts` SHALL load
translation resources via `i18next-fs-backend` reading from the `locales/<lng>/<ns>.json` path pattern.
The instance SHALL NOT use `i18next-http-backend`, `i18next-fetch-backend`, or any network-based backend
for server-side resource loading.

#### Scenario: Server instance resolves a namespace file from disk

- **WHEN** the i18next middleware initializes for a request requesting namespace `"fixture"` in locale `"en"`
- **THEN** the fs-backend reads `locales/en/fixture.json` from the local filesystem
- **AND** no outbound HTTP request is made to load that translation data

#### Scenario: Missing namespace file does not crash the request

- **WHEN** the fs-backend attempts to read a namespace file that does not exist on disk
- **THEN** the i18next instance SHALL resolve with an empty resource bundle for that namespace rather than
  throwing an unhandled error
- **AND** the request SHALL continue processing (the middleware calls `next()`)

### Requirement: `i18nextMiddleware` is registered alongside, not instead of, `requestContextMiddleware`

`app/root.tsx`'s exported `middleware` array SHALL include both `requestContextMiddleware` and the new
i18next middleware. The existing `requestContextMiddleware` entry MUST remain present and MUST NOT be
removed or reordered such that its `userId`/`tenantId` population is skipped for any request.

#### Scenario: Both middlewares run for every request

- **WHEN** any request is handled by the route tree rooted at `app/root.tsx`
- **THEN** `requestContextMiddleware` SHALL populate the async-local-storage request context as it does today
- **AND** the i18next middleware SHALL also run, making `getLocale(context)` and `getInstance(context)`
  available to loaders in the same request

### Requirement: Locale resolution chain follows ADR-001's 4-step order

The `findLocale` callback used by the i18next middleware's `detection` option SHALL implement, in order:
(1) URL path segment against the existing `VALID_LANGUAGES` allow-list, (2) `user.preferredLocale` if
available, (3) the tenant's default locale (`instanceSystemSettingsTable.language`, read via the existing
`getCountrySettingsFromSession(request)` accessor) if available, (4) fall back to `"en"`. Step 2 SHALL be
implemented as an explicit hook point that returns no value, since the underlying `user.preferredLocale`
column does not exist — it MUST NOT throw, and MUST NOT be silently skipped from the function without a
comment explaining why. Step 3 SHALL be a real, working lookup — not a hook point — since its backing
column and accessor both already exist; it MUST also fail null-safely (not throw) when the current request
has no session or no cached tenant settings (e.g. an anonymous or pre-login request).

#### Scenario: Valid URL language segment wins

- **WHEN** a request is made to `/fr/some-route`
- **THEN** `findLocale` SHALL return `"fr"`
- **AND** the resolved locale used by the i18next instance for that request SHALL be `"fr"`

#### Scenario: Tenant default locale wins when no URL segment is present

- **WHEN** a request is made to a path with no valid language segment (e.g. `/some-route`), and
  `getCountrySettingsFromSession(request)` resolves to a cached `instanceSystemSettingsTable` row whose
  `language` field is `"fr"`
- **THEN** `findLocale` SHALL return `"fr"` (step 3, since step 1 found nothing and step 2 has no data
  source)
- **AND** the resolved locale used by the i18next instance for that request SHALL be `"fr"`

#### Scenario: Invalid or missing URL segment and no tenant setting falls through to default

- **WHEN** a request is made to `/xx/some-route` (an unsupported language code) or to a path with no
  language segment, and `getCountrySettingsFromSession(request)` resolves to `undefined` (no session, or
  no `countrySettings` cached — e.g. an anonymous or pre-login request)
- **THEN** `findLocale` SHALL return `null` (step 2 has no data source; step 3 has no session data to read)
- **AND** the i18next instance SHALL resolve the locale to `fallbackLanguage: "en"`

#### Scenario: Resolution never throws regardless of request shape

- **WHEN** `findLocale` is invoked with a request whose URL has an unusual or malformed path
- **THEN** the function SHALL return `null` rather than throwing
- **AND** the middleware chain SHALL continue to `next()` without an unhandled rejection

### Requirement: Client hydration uses server-serialized resource bundles, not a client-side HTTP fetch

`app/entry.client.tsx` SHALL initialize the client i18next instance using translation data serialized by the
server into the HTML response (via `getInstance(context).getDataByLanguage(lang)`), and SHALL NOT configure
a client-side i18next backend plugin that performs a network request to obtain translation data during
hydration.

#### Scenario: Hydration reuses server-loaded translations without a network round-trip

- **WHEN** the browser loads a server-rendered page and `app/entry.client.tsx` runs
- **THEN** the client i18next instance SHALL be initialized with the resource bundle embedded in the HTML
  response
- **AND** no additional HTTP request for translation JSON SHALL be observed during hydration

#### Scenario: Hydration succeeds and the app remains interactive

- **WHEN** a user navigates to any route after the custom `entry.client.tsx` is added
- **THEN** `hydrateRoot` SHALL complete without throwing
- **AND** client-side interactive elements (e.g. links, buttons) SHALL respond to user input exactly as
  before this change, confirming the custom entry did not regress default React Router v7 hydration
  behavior

### Requirement: The existing translation system is unaffected

The system SHALL NOT change the behavior of any route, component, or server function that uses
`ViewContext.t({code, msg})`, `loadTranslations`, `createTranslationGetter`, or the
`globalThis.createTranslationGetter` global as a result of this middleware being added.

#### Scenario: Old system continues to serve translations unchanged

- **WHEN** any existing route that calls `useViewContext().t({code, msg})` is rendered after this change
  ships
- **THEN** the rendered translation SHALL be identical to its value before this change
- **AND** `app/backend.server/translations.ts` and `app/frontend/translations.ts` SHALL be unmodified by
  this change
