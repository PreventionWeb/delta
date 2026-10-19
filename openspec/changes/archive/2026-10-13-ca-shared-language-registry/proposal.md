## Why

DELTA currently has four independent, unsynchronized answers to "what languages does the
system support," confirmed by reading the code directly (not assumed): `VALID_LANGUAGES` in
`app/utils/lang.backend.ts` (9 codes, load-bearing across route validation, the ADR-001
i18next stack, and `resolveLocale()`); `availableLanguagesWhiteList` in
`app/backend.server/translations.ts` (5 codes, narrower for no apparent reason — `zh`/`fr`/
`es`/`tg` already have complete translation files but cannot be selected as a tenant's
system language today because `SettingsService.updateSettings()` gates on this narrower
list); the `language` DB table (seeded once, in hand-written migration SQL, with zero code
reference to `VALID_LANGUAGES`); and the legacy content-translation loader itself (no
whitelist of its own, confirmed empirically this session to load and serve any language code
with files on disk). Two of these lists can silently drift from each other and from the DB
with no mechanism to catch it.

Separately, `language.language_cd` is `varchar(2)` with `CHECK (char_length = 2)`, which
cannot hold a real BCP 47 tag with a script or region subtag (e.g. `sr-Latn`). This is a
Shared Kernel schema limitation, not specific to any one domain's use of the table.

Both problems sit in the same place (the application's definition of "which languages exist"
and how that definition is represented in code vs. the database) and are addressed together
in this one change per explicit scope decision — not deferred to a future "system settings"
bounded context, since no such context migration is scheduled and deferring risks indefinite
postponement.

## What Changes

- Eliminate `availableLanguagesWhiteList` in `app/backend.server/translations.ts`.
  `getAvailableLanguages()` is redefined to intersect on-disk locale files with
  `VALID_LANGUAGES` directly, making `VALID_LANGUAGES` (`app/utils/lang.backend.ts`) the
  single application-layer source of truth for which languages DELTA supports. **BEHAVIOR
  CHANGE**: tenants can now select `zh`, `fr`, `es`, or `tg` as their default system language
  in Settings (`app/routes/$lang+/settings+/system.tsx`) — previously blocked by the
  narrower whitelist with no evidence that restriction was intentional.
- Widen `language.language_cd` from `varchar(2)` with an exact-2-character CHECK to a wider
  `varchar` with a BCP-47-shaped CHECK constraint, capable of holding tags with script/region
  subtags (e.g. `sr-Latn`, `zh-Hans`, `es-419`). **BREAKING** (schema): any code or query
  assuming a fixed 2-character `language_cd` must be reviewed (see Impact). This change makes
  the column _capable_ of holding a variant tag — it does not add a real variant row now.
- Update `resolveLocale()`'s `matchAcceptLanguage` (`app/shared/i18n/resolveLocale.ts`) so
  that Accept-Language matching is no longer a one-step fold to the bare primary subtag, but
  progressively truncates the requested tag (e.g. `sr-Latn-RS` → `sr-Latn` → `sr`) against
  `supportedLocales`, so that a future script/region-variant `language` row can be matched
  correctly instead of always being folded past.
- Document a mechanism (resolved below, see Design) to keep the `language` DB table and the
  `VALID_LANGUAGES` constant from silently drifting apart again.
- Amend `_docs/decisions/ADR-001-multilingual-strategy.md` with a dated addendum recording
  the consolidated source of truth and the widened column (ADR status remains unchanged;
  this is additive, not a rewrite).

Three design questions (DB/code sync mechanism going forward; whether `language` rows are
keyed by full BCP-47 tag and what that means for `resolveLocale`; how strict the widened
CHECK constraint should be) were written up in `design.md` with options and tradeoffs rather
than resolved by assumption, and were **resolved 2026-10-12** — see `design.md`'s Decisions
section for the chosen options and rationale.

## Capabilities

### New Capabilities

- `shared-language-registry`: defines `VALID_LANGUAGES` as the sole application-layer source
  of truth for supported languages, the elimination of `availableLanguagesWhiteList`, the
  redefined behavior of `getAvailableLanguages()`, and the chosen mechanism for keeping the
  `language` DB table consistent with `VALID_LANGUAGES`.

### Modified Capabilities

- `shared-translation-schema`: the `language` table's `language_cd` column shape and CHECK
  constraint change from exact-2-character to a wider, BCP-47-shaped pattern.
- `locale-resolution`: `resolveLocale()`'s Accept-Language matching changes from single-step
  primary-subtag folding to progressive truncation, to support future script/region variant
  tags.

## Impact

**Files expected to change (implementation, not part of this OpenSpec artifact set):**

- `app/utils/lang.backend.ts` — no content change to `VALID_LANGUAGES` itself; becomes the
  documented single source of truth referenced by `translations.ts`.
- `app/backend.server/translations.ts` — remove `availableLanguagesWhiteList`; redefine
  `getAvailableLanguages()` to filter disk-discovered languages against `VALID_LANGUAGES`.
- `app/domains/shared/infrastructure/languageTable.ts` — widen `languageCd` column
  definition and CHECK constraint.
- A new hand-authored migration under `app/drizzle/migrations/` — widen the real DB column
  and replace the real constraint (named `language_cd_length_check` in the applied DB, not
  `language_language_cd_length_check` as the Drizzle schema file labels it — see design.md).
  **DB migration required.** Apply with `yarn dbsync`, never `drizzle-kit push`.
- `app/shared/i18n/resolveLocale.ts` — `matchAcceptLanguage` progressive-truncation logic.
- `app/shared/i18n/resolveLocale.test.ts` — new scenarios for variant-tag truncation.
- `tests/integration/db/queries/language.test.ts` — several existing assertions are tied to
  the exact-2-character constraint (e.g. the 3-char SQLSTATE 22001 truncation scenario) and
  must be revised to match the new column width and constraint shape.
- `tests/integration/db/testSchema/languageTable.ts` — no edit needed; it re-exports the real
  schema file, so it picks up the widened column automatically.
- `tests/integration/db/queries/languageRegistryConsistency.test.ts` — new (Decision Q1): a
  raw-PGlite-client migration-replay test asserting the seeded `language_cd` set equals
  `VALID_LANGUAGES` exactly.
- `tests/unit/backend.server/translations.test.ts` — new unit coverage for
  `getAvailableLanguages()`'s three spec scenarios.
- `tests/integration/db/services/settingsService.languagePersistence.test.ts` — one test
  added confirming a previously-excluded language (`zh`) can now be persisted.
- `app/drizzle/migrations/meta/_journal.json` — new entry registering the hand-authored
  migration.
- `_docs/decisions/ADR-001-multilingual-strategy.md` — dated addendum.
- No changes needed to `app/middleware/i18next.server.ts`,
  `app/routes/$lang+/settings+/system.tsx`, `openspec/specs/i18n-ssr-middleware`, or
  `openspec/specs/notices-controller` — all reference `VALID_LANGUAGES` by name already and
  require no spec or code change; confirmed the Settings dropdown renders raw language codes
  as both label and value (no translated-label lookup), so widening `getAvailableLanguages()`
  carries no missing-translation crash risk.

**Test approach:** PGlite integration tier (`yarn test:run2`) for the `language` table CHECK
constraint changes (`tests/integration/db/queries/language.test.ts`) — note design.md's
finding that the PGlite harness uses `drizzle-kit`'s `pushSchema` against the Drizzle schema
file, not migration replay, which affects what a DB/code sync test can actually verify. Unit
tier (Vitest, no DB) for `resolveLocale.test.ts`'s pure-function truncation logic.

**Security / multi-tenancy:** `language` is global Shared Kernel reference data with no
`countryAccountsId` scoping — this is correct and unchanged; it is explicitly called out so
a reviewer does not flag its absence as a missed scoping requirement. No auth surface is
touched.

**Design questions, resolved 2026-10-12** (see design.md's Decisions section for full
rationale):

1. How the `language` DB table stays in sync with `VALID_LANGUAGES` going forward — a PGlite
   migration-replay consistency test (Option C), implemented as
   `tests/integration/db/queries/languageRegistryConsistency.test.ts`.
2. Whether a future script/region variant is a distinct `language` row keyed by full BCP-47
   tag — yes, with `resolveLocale()`'s matching changed to progressive truncation.
3. Whether the widened CHECK constraint reuses `resolveLocale.ts`'s existing permissive
   `BCP_47_PATTERN` — yes (Option A), accepting the two documented gaps in
   `specs/shared-translation-schema/spec.md`.
