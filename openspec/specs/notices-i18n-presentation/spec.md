## Purpose

Defines how the Notices domain's presentation layer sources translated UI strings via
`react-i18next`, replacing the old `useViewContext().t({code, msg})` system for this domain's
own translation calls, per ADR-001.

## Requirements

### Requirement: Notices presentation components source translated strings via react-i18next

`NoticeListPage` (`app/domains/notices/presentation/NoticeListPage.tsx`) and
`NoticeDetailPage` (`app/domains/notices/presentation/NoticeDetailPage.tsx`) SHALL obtain all
UI-label strings via `useTranslation("notices")`'s `t(key)` function, using nested dot-separated
keys (i18next's default `keySeparator: "."`). Neither component SHALL call
`useViewContext().t({code, msg})` for any UI label. `useViewContext()` MAY still be called by
either component solely to read `.lang` for `LocaleMap` resolution.

#### Scenario: List page empty-state message is translated
- **WHEN** `NoticeListPage` renders with an empty `data` array
- **THEN** the rendered empty-state text MUST come from the `"notices"` namespace's
  `list.empty` key
- **AND** the component MUST NOT call `useViewContext().t(...)` to obtain that text

#### Scenario: List page column headers are translated
- **WHEN** `NoticeListPage` renders its `DataTable`
- **THEN** each column header (title, status, published date, updated date, actions) MUST be
  sourced from a `"notices"` namespace key under `list.columns.*`

#### Scenario: Status labels are translated
- **WHEN** `NoticeListPage` or `NoticeDetailPage` renders a notice's publication status
- **THEN** the "Published" label MUST come from the `"notices"` namespace's `status.published`
  key and the "Draft" label MUST come from `status.draft`

#### Scenario: The row-level View action uses the shared common namespace, not the notices namespace
- **WHEN** `NoticeListPage` renders a row's action button
- **THEN** the button's accessible label MUST be sourced from the `"common"` namespace's `view`
  key, not a `"notices"`-namespaced key

#### Scenario: Component still resolves locale-specific content via useViewContext().lang
- **WHEN** `NoticeDetailPage` resolves a notice's `titleJson`/`bodyJson` `LocaleMap`
- **THEN** it MUST still use `useViewContext().lang` as the lookup key, unaffected by the
  translation-source change

### Requirement: NoticeErrorBoundary renders translated fallback text without leaking error internals

`NoticeErrorBoundary` (`app/domains/notices/presentation/NoticeErrorBoundary.tsx`) SHALL source
its non-Response fallback message via `useTranslation("common")`'s `t("error.generic_retry")`
(or an equivalently-named key under the `error.*` sub-tree). The translated string SHALL NOT be
constructed by interpolating any property of the caught error (`.message`, `.stack`, or any
other field) into the translation call — the rendered text for this branch MUST be the fixed
translated string only, matching the existing ADR-003 Rule 4 guarantee that no internal error
detail is ever leaked to the client.

#### Scenario: Generic fallback text is translated but still contains no leaked error detail
- **WHEN** `useRouteError()` returns a plain `Error` (e.g. `new Error("Internal secret stack
  detail")`) and `isRouteErrorResponse(error)` is `false`
- **THEN** `NoticeErrorBoundary` MUST render the translated fallback string
- **AND** the rendered output MUST NOT contain the string `"Internal secret stack detail"` or
  any other property of the caught `Error`

#### Scenario: Fallback text is sourced from a real translation key, not a hardcoded literal
- **WHEN** the non-Response branch of `NoticeErrorBoundary` is inspected
- **THEN** it MUST call `t(...)` from `useTranslation("common")` rather than rendering a
  hardcoded English string literal

### Requirement: Notices route loaders load the required namespaces before rendering

The `loader` exported from `app/routes/$lang+/_authenticated+/notices+/_index.tsx` and from
`.../$id.tsx` SHALL each call `getInstance(context).loadNamespaces(["notices", "common"])`
(or two separate `loadNamespaces` calls covering the same two namespaces) before returning,
so that server-side rendering of the matched route's component tree never encounters an
unloaded namespace.

#### Scenario: List route loader loads both namespaces
- **WHEN** the list route's loader executes for any request
- **THEN** `getInstance(context).loadNamespaces(...)` MUST have been called with both
  `"notices"` and `"common"` before the loader returns

#### Scenario: Detail route loader loads both namespaces
- **WHEN** the detail route's loader executes for any request
- **THEN** `getInstance(context).loadNamespaces(...)` MUST have been called with both
  `"notices"` and `"common"` before the loader returns

#### Scenario: A namespace-loading failure does not silently render raw translation keys
- **WHEN** `loadNamespaces` resolves before the component renders
- **THEN** `t()` calls in `NoticeListPage`, `NoticeDetailPage`, and `NoticeErrorBoundary` MUST
  resolve to real translated strings, not raw dotted key names, in the server-rendered HTML

### Requirement: The `common` namespace's `view` key is scoped to Notices' own action button in this change

`locales/<lang>/common.json` SHALL be created as a new, permanent namespace file. Its initial
content SHALL contain the `view` key migrated from the old system's `common.view` code, and the
`error.generic`/`error.generic_retry` keys used by `NoticeErrorBoundary`. This change SHALL NOT
modify `ActionLinks.tsx`, `View.tsx`, `action_links.tsx`, `view_form.tsx`,
`view_main_data_collection.tsx`, or the two settings routes under `assets+`/`geography+` that
also reference the old `common.view`/`common.view_this_event`/`common.view_all_events` codes —
those continue to use `useViewContext().t({code, msg})` unchanged.

#### Scenario: Only NoticeListPage's View button migrates
- **WHEN** the repository is inspected after this change
- **THEN** `NoticeListPage.tsx`'s row action button MUST use `useTranslation("common")`'s
  `t("view")`
- **AND** `ActionLinks.tsx`, `action_links.tsx`, `view_form.tsx`, `view_main_data_collection.tsx`,
  `assets+/_layout.tsx`, and `geography+/_index.tsx` MUST each still call
  `useViewContext().t({ code: "common.view", ... })` (or their respective
  `common.view_this_event`/`common.view_all_events` codes) unchanged

### Requirement: Client-side navigation between the list and detail routes renders correct translated text

Client-side (SPA) navigation from the Notices list route to the Notices detail route, and back,
SHALL render correctly-translated text on both ends of the navigation, without a full page
reload, since both routes load the same `"notices"`/`"common"` namespaces and never change the
active locale between each other.

#### Scenario: List-to-detail client-side navigation preserves translated text
- **WHEN** a user on the server-rendered Notices list page clicks a row's View action, causing a
  client-side (non-full-reload) navigation to that notice's detail route
- **THEN** the detail page's translated status label ("Published" or "Draft") MUST render
  correctly, matching what a full page load of that same URL would render

#### Scenario: Detail-to-list client-side navigation preserves translated text
- **WHEN** a user on the server-rendered Notices detail page navigates back to the list route via
  a client-side (non-full-reload) navigation
- **THEN** the list page's translated column headers and status labels MUST render correctly,
  matching what a full page load of that same URL would render
