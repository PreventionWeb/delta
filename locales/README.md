# Locale file conventions

Two systems coexist here, per ADR-001 (`_docs/decisions/ADR-001-multilingual-strategy.md`):

- `locales/app/<lang>.json` — the existing flat array-of-`{id, translation, description}` files used by
  `ViewContext.t({code, msg})`. Unchanged by this convention.
- `locales/<lang>/<domain>.json` — new namespace-per-domain files (e.g. `locales/en/notices.json`) for
  `react-i18next`'s `t('key')` syntax, read by the server i18next instance
  (`app/middleware/i18next.server.ts`) via `i18next-fs-backend`.

No `locales/<lang>/<domain>.json` file exists yet — the first one is a separate, later change.

`locales/content/` and `locales/api-cache/` are unrelated to either system.
