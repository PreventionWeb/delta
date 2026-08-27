# Locale file conventions

Two systems coexist here, per ADR-001 (`_docs/decisions/ADR-001-multilingual-strategy.md`):

- `locales/app/<lang>.json` — the existing flat array-of-`{id, translation, description}` files used by
  `ViewContext.t({code, msg})`. Unchanged by this convention.
- `locales/<lang>/<domain>.json` — new namespace-per-domain files (e.g. `locales/en/notices.json`) for
  `react-i18next`'s `t('key')` syntax, read by the server i18next instance
  (`app/middleware/i18next.server.ts`) via `i18next-fs-backend`.

`common.json` is a permanent, shared namespace for cross-domain UI strings (e.g. `view`) and generic
fallback error copy (`error.generic`, `error.generic_retry`) that every domain's ErrorBoundary needs
verbatim. Domain files (e.g. `notices.json`) hold only that domain's own content — put a genuinely
domain-specific error message (e.g. "this notice no longer exists") in the domain's own file, not
`common.json`, once one actually exists; don't add one speculatively before it's wired to real code.

`locales/content/` and `locales/api-cache/` are unrelated to either system.
