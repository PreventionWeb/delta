## Context

See `proposal.md` - Why for the motivating four-list drift problem. This section records
only the implementation-shaping facts confirmed by reading the code and test infrastructure
directly this session.

**Legacy vs. CA code.** `app/utils/lang.backend.ts`, `app/backend.server/translations.ts`,
and `app/services/settingsService.ts` are legacy, pre-Clean-Architecture code. This change
touches them **in place** rather than introducing a new Shared Kernel abstraction (e.g. a
`LanguageRegistryService` port), for two reasons: (1) `VALID_LANGUAGES` is consumed
_synchronously, at module-load time_ by `app/middleware/i18next.server.ts`'s
`supportedLngs`/`detection.supportedLanguages` and by zod enums evaluated at import time in
`CreateNoticeRequest.ts`/`UpdateNoticeRequest.ts` — introducing a port/adapter would require
either an async resolution step these call sites cannot accommodate without a larger refactor,
or a synchronous facade that just re-exports the same array, which is indirection without
benefit; (2) the scope explicitly excludes a new "system settings" bounded context (proposal
decision, not re-litigated here). The one piece of new behavior — the DB/constant consistency
check (Decision Q1) — is a test, not a runtime abstraction, so it does not require a port.

**The DB table is Shared Kernel, already CA.** `app/domains/shared/infrastructure/
languageTable.ts` already lives under the CA `domains/shared` boundary (added by the archived
`ca-shared-multilang-taxonomy-schema` change). Only its column definition changes here.

**Constraint name drift (confirmed, blocking for the migration task).** The Drizzle schema
file names the check `language_language_cd_length_check`. The migration that actually created
it (`20261009091033_alter_language_table.sql`) named it `language_cd_length_check`:

```sql
ALTER TABLE public.language ADD CONSTRAINT language_cd_length_check CHECK (char_length(language_cd) = 2);
```

The new migration MUST `DROP CONSTRAINT language_cd_length_check` (the real applied name) and
add the new constraint under a new name (e.g. `language_cd_format_check`). The Drizzle schema
file's `check(...)` call must be updated to use that same new name so `languageTable.ts` and
the migration never disagree again. Using the Drizzle-file name in a `DROP CONSTRAINT
IF EXISTS` would silently no-op and leave the 2-character constraint in place in any
environment where only the real migration history has been applied (i.e. everywhere outside a
fresh `pushSchema` test run).

**PGlite test harness does not replay migrations (confirmed — changes what a "sync check"
test can look like).** `tests/integration/db/setup.ts` builds its schema with drizzle-kit's
`pushSchema(schema, testDb, ...)` directly against the **Drizzle schema files**, not by
running `app/drizzle/migrations/*.sql`. `pushSchema` only creates tables/constraints — it
never runs the `INSERT`-based seed data in the migration files. This means:

- `tests/integration/db/queries/language.test.ts` (which uses the shared `dr` from `setup.ts`)
  correctly exercises the _widened column and new CHECK constraint_ the moment
  `languageTable.ts` is updated — no migration replay needed for that.
- It **cannot** exercise whether the real seed migration actually produces the 9 expected rows
  with the new constraint — the shared harness never runs that SQL at all.
- The repo already has a precedent for the second kind of test:
  `tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts` builds a **separate,
  raw PGlite client** (not the shared `dr`), hand-writes the pre-migration DDL, then
  `readFileSync`s and execs the real `.sql` migration file to verify its effect. Decision Q1
  reuses this exact pattern.

**Settings dropdown risk, checked and cleared.** `app/routes/$lang+/settings+/system.tsx`
passes `loaderData.availableLanguages` (raw language code strings, e.g. `"zh"`) directly as
PrimeReact `Dropdown`'s `options` — there is no per-language translated label lookup, so no
`ctx.t()` call can fail for a language newly made selectable. Confirmed by reading lines 23–67
and 422–433 of that file. Widening `getAvailableLanguages()` is safe with respect to this
page.

**Other `varchar(2)` / fixed-length locale columns: none found.** Repo-wide search found only
`languageTable.ts`'s `language_cd`. `instanceSystemSettingsTable.language` (used by
`SettingsService`) is unconstrained by length at the DB level — it is validated at the
application layer via `getAvailableLanguages().includes(language)`. No other column is
in scope.

## Goals / Non-Goals

**Goals:**

- One application-layer source of truth (`VALID_LANGUAGES`) for "which languages exist."
- A `language.language_cd` column and CHECK constraint capable of holding a BCP-47 tag with
  script/region subtags.
- `resolveLocale()` infrastructure capable of matching a variant tag, without requiring a real
  variant to be added now.
- A durable, automated way to catch future drift between `VALID_LANGUAGES` and the `language`
  table (Decision Q1).

**Non-Goals:**

- Adding any new language or variant (e.g. `sr-Latn` itself) to `VALID_LANGUAGES` or the
  `language` table. This change makes that _possible_ later without further infra work.
- A full RFC 5646 ABNF validator. Both the existing `resolveLocale.ts` pattern and this
  change's DB constraint are deliberately pragmatic shape checks, not semantic BCP-47
  registry validation (see Decision Q3).
- Introducing a `user.preferredLocale`-aware or tenant-settings-aware Shared Kernel service.
  Out of scope per the proposal's explicit scope boundary.
- Changing `VALID_LANGUAGES`'s type to a `const`-asserted literal union. `isValidLanguage`'s
  `.includes(lang)` call (where `lang: string | undefined`) and the zod `.enum()` casts in
  `CreateNoticeRequest.ts`/`UpdateNoticeRequest.ts` all compile today against `string[]`;
  switching to `as const` would require auditing every call site for a widened-to-literal-type
  ripple, which is a larger refactor than this change's scope. `VALID_LANGUAGES` keeps its
  current `string[]` type.

## Decisions

### Decision: Consolidate on `VALID_LANGUAGES`, delete `availableLanguagesWhiteList`

`getAvailableLanguages()` (`app/backend.server/translations.ts`) changes from filtering
disk-discovered languages against its own `availableLanguagesWhiteList` literal, to filtering
against the imported `VALID_LANGUAGES` from `app/utils/lang.backend.ts`. No other call site
changes. This is a pure behavior widening (5 → 9 selectable languages in Settings) with no
evidence the narrower list was intentional (confirmed: `zh`/`fr`/`es`/`tg` have complete
`locales/app/` and `locales/content/` files).

### Decision Q1 (RESOLVED 2026-10-12: Option C): keeping `language` and `VALID_LANGUAGES` in sync

**Alternative considered and rejected: make the `language` DB table itself the sole source of
truth, with `VALID_LANGUAGES` derived from it.** This is the textbook single-source-of-truth
answer and was raised directly by the user — rejected specifically because `VALID_LANGUAGES`
is consumed _synchronously at module-import time_ in two real places:
`app/middleware/i18next.server.ts` passes it straight into `createI18nextMiddleware({...})`'s
top-level config object, and `CreateNoticeRequest.ts`/`UpdateNoticeRequest.ts` build their zod
schemas (`z.enum(VALID_LANGUAGES)`) the same way. Making the DB the real source would require
either restructuring app bootstrap so these modules can't finish loading until a DB read
completes (meaning the whole app fails to start on a DB outage or an un-migrated fresh
environment, not just a locale feature degrading — a more severe version of Option B's own
rejected risk below), or caching a DB read into a mutable variable at boot (trading a plain
importable constant for a value only safe to read after bootstrap order is correct — a new
class of ordering bug). It would also give every unit test that transitively imports anything
touching `VALID_LANGUAGES` a hard DB dependency this codebase's test tiers are deliberately
structured to avoid. Not a rejection of the idea in general — a rejection given how this
specific code currently loads.

Options considered:

| Option                                            | Mechanism                                                                                                                                                                                                                                                                                                                                                       | Catches                                                                                                                                 | Misses                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Process discipline only                        | Code review checklist item: "changed `VALID_LANGUAGES`? add a migration."                                                                                                                                                                                                                                                                                       | Nothing automatically — relies entirely on reviewer memory.                                                                             | Everything if the reviewer forgets; no CI signal.                                                                                                                                                                                                                                  |
| B. Startup-time consistency check                 | App boot queries `language`, compares to `VALID_LANGUAGES`, fails loudly on mismatch.                                                                                                                                                                                                                                                                           | Any drift, in any environment, immediately.                                                                                             | Turns a content-only mismatch into a **production outage** — a config/data gap becomes a 5xx for every request. Every test bootstrap (including ones with no interest in languages) must now also satisfy it, adding a hard DB dependency to app startup that doesn't exist today. |
| **C. PGlite migration-replay test (recommended)** | A dedicated integration test, following the existing `hipsMultilangCorrectionMigration.test.ts` pattern: spin a raw PGlite client, replay the real migration files that create/seed `language` in order, then assert the resulting `language_cd` set equals `new Set(VALID_LANGUAGES)` exactly (both directions — extra DB rows and missing DB rows both fail). | Drift introduced by any future code change, caught in CI before merge. Uses an already-proven pattern in this repo — no new test infra. | Does not catch an out-of-band production edit (e.g. someone runs a manual `UPDATE` against a live DB outside the migration pipeline) — but that is true of every migration-based safeguard in this codebase, not unique to this check.                                             |

**Recommendation:** Option C. It is the only option that is both automatic and does not add a
runtime/boot-time DB dependency. Option B's failure mode (boot crash from a content mismatch)
is disproportionate to the risk. Option A alone has already failed once — it is the status quo
that produced the current drift.

**Decided:** Option C, as recommended.

**Implementation note (found during build):** `20261009042834` is not standalone — it
RAISE EXCEPTIONs on exact legacy row counts (`hip_class`=8, `hip_cluster`=38, `hip_hazard`=281)
and exact FK names on `hazardous_event`/`hazard_type_field_definition`/
`hazard_type_custom_field_definition`, all of which only exist after dozens of earlier
migrations. Replaying the full ~60-file history was considered and rejected (large,
mostly-orthogonal PGlite failure surface, two 100KB+ data migrations, 3 files touching
postgis). The test instead hand-writes a minimal fixture reproducing only the objects
`20261009042834` asserts on by exact name/count — table shapes trimmed to what it reads (e.g.
`country_accounts` is a one-column stub, the field-definition tables drop columns it never
touches), but every FK name and the guarded columns match the real migration that created
them (`20260904120000_add_hip_hierarchy_tables.sql`,
`20260907170000_add_hazard_type_field_tables.sql`,
`20260909090000_add_specific_hazard_id_to_hazardous_event.sql`,
`20260109060059_multi_lang_hips_sectors_assets.sql` +
`20260204082618_update_hip_name_constraints.sql`) — the same pattern
`hipsMultilangCorrectionMigration.test.ts` already uses, scaled up to satisfy the heavier
guards. The migration list itself is read from `_journal.json` (every entry from
`20261009042834` onward, in `idx` order), not hardcoded, then filtered to the ones whose SQL
actually references `public.language` (word-bounded, so a same-named column on another table,
e.g. `instance_system_settings.language`, doesn't match). The idx-only cut was tried first and
rejected: it would replay every future migration regardless of relevance against this test's
minimal fixture, breaking on the next unrelated schema change. The content filter keeps the
auto-discovery benefit (a future migration seeding/altering `language` is replayed
automatically) without that blast radius. See
`tests/integration/db/queries/languageRegistryConsistency.test.ts`.

### Decision Q2 (RESOLVED 2026-10-12: as recommended): variant rows and `resolveLocale` matching

If a future script/region variant is added (e.g. `sr-Latn`), is it a **new, independent**
`language` row keyed by the full tag `"sr-Latn"` (distinct from the existing `"sr"` row), or
is `language_cd` still expected to hold only primary-language codes with variants handled some
other way (e.g. a separate `script`/`region` column)?

**Recommendation:** yes, a full-tag row (`"sr-Latn"` as its own `language_cd`), because:

- It requires no schema change beyond the width/CHECK change already in this proposal (no new
  columns).
- It matches how `VALID_LANGUAGES`/`supportedLocales` already work today — a flat list of
  complete tags, not a decomposed language+script+region triple.
- It keeps `text_content`/`translation` joins unchanged (`translation.language_id` still
  just points at one `language` row, whatever its tag).

**Consequence for `resolveLocale()`'s `matchAcceptLanguage`:** today it folds any tag straight
to its bare primary subtag on the first match attempt (`entry.split("-")[0]`), so `"sr-Latn-RS"`
and `"sr"` always resolve identically once `"sr"` is supported — a variant row could never be
selected over the base language. This change replaces that with **progressive truncation**:
try the full tag, then drop the rightmost subtag and retry, down to the bare primary subtag.

```
"sr-Latn-RS" → try "sr-Latn-RS" → try "sr-Latn" → try "sr"
```

This is backward compatible: for the current 2-letter-only `supportedLocales`, the only
subtag that can ever match is the bare primary one, so behavior for every existing scenario in
`openspec/specs/locale-resolution/spec.md` is unchanged. Two matching-policy sub-decisions,
both decided as recommended alongside Q2's main question:

- **Exact-vs-broader match**: if only `"sr-Latn"` is supported (not bare `"sr"`), should a
  bare `Accept-Language: sr` header match `"sr-Latn"`? **Decided: no** — a client asking
  for `"sr"` has not expressed a script preference; matching it to `"sr-Latn"` guesses. Falls
  through to the next chain step instead.
- **Case handling**: BCP 47 tags are case-insensitive by spec (script conventionally
  title-case, region upper-case, language lower-case), but Postgres `UNIQUE`/`=` comparison on
  `varchar` is case-sensitive, and `isValidLanguage`'s route-segment check and
  `matchAcceptLanguage`'s `supportedLocales.includes(entry)` are both exact string comparisons
  today. **Decided: do not** add case-folding in this change — require all stored and
  compared tags to use a single canonical casing (lowercase language, Title-case script,
  UPPERCASE region), by convention only. With Decision Q3 resolved as Option A (a generic
  alphanumeric-hyphen shape, not a positional language/script/region pattern), the CHECK
  constraint itself does not encode or enforce this convention at all — it is pure
  documented discipline, weaker than Option B's structural pattern would have provided.
  Adding a runtime normalizer is a larger behavior change than this proposal's scope and is
  left as a follow-up if a real variant is ever added.
- **i18next's own matching**: `app/middleware/i18next.server.ts` passes `VALID_LANGUAGES`
  straight through as both `supportedLngs` and `detection.supportedLanguages`; it does not use
  i18next's `load`/`nonExplicitSupportedLngs` options (confirmed — not referenced anywhere in
  that file today). Since `findLocale`'s own `VALID_LANGUAGES.includes(segment)` check is exact
  and does not call into i18next's language-code negotiation at all, there is no second,
  disagreeing fallback mechanism to reconcile for the cases this change touches.

### Decision Q3 (RESOLVED 2026-10-12: Option A, overriding the recommendation): how strict is the widened CHECK constraint

Both options widen the column to `varchar(35)` (RFC 5646 §4.4.1's "worst case" length guidance
for a single tag, with headroom). They differ only in the CHECK:

**Option A — reuse `resolveLocale.ts`'s exact pattern**
`CHECK (language_cd ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$')`

- Consistency: the same shape is accepted at the request layer (Accept-Language parsing) and
  the DB layer — one mental model, matching error semantics.
- Accepts non-standard tags, including the user's own tested example `"en-fil"` (two
  primary-language-like subtags stacked — not a real BCP-47 construction).
- **Regression found during this design pass:** a bare single character, e.g. `language_cd =
"f"`, currently rejected by the existing exact-2-char CHECK, would **pass** this pattern
  (`[A-Za-z0-9]+` matches length 1). That specific existing guarantee would be lost.

**Option B — structural pattern approximating RFC 5646's common subtag positions (recommended)**
`CHECK (language_cd ~ '^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-[A-Za-z0-9]{5,8}|-[0-9][A-Za-z0-9]{3})*$')`
(language: 2-3 lowercase letters; optional 4-letter script; optional 2-letter or 3-digit
region; optional variant subtags per RFC 5646's length convention) — still a shape check, not
an IANA subtag-registry lookup.

- Rejects `"en-fil"`: after the primary subtag `en`, `"fil"` (3 letters) fits neither the
  script position (exactly 4 letters) nor the region position (2 letters or 3 digits), so the
  whole tag fails the pattern.
- Also rejects the single-character regression above (primary subtag floor is 2).
- Accepts `sr-Latn`, `zh-Hans`, `es-419`.
- **Trade-off**: diverges from `resolveLocale.ts`'s existing permissive pattern — a value that
  passes Accept-Language header validation at the request layer could still fail to persist as
  a `language` row. This is arguably correct (the `language` table is a curated reference list,
  not a mirror of every header value a client might send), but it is a real inconsistency
  between what "looks syntactically valid" at the two layers, and a future maintainer touching
  either pattern must know both exist and why they differ.

**Decided: Option A**, overriding this document's own recommendation (Option B). Rationale
given: one consistent mental model for "what looks like a syntactically valid BCP-47 tag"
across the request layer (`resolveLocale.ts`) and the DB layer, rather than two different
definitions a future maintainer has to know both exist. Accepted consequences, both now
recorded as explicit "accepted gap" scenarios in `specs/shared-translation-schema/spec.md`
rather than silently dropped: `"en-fil"` (not real BCP-47) is NOT rejected by the DB
constraint, and a single-character `language_cd` (e.g. `"f"`) is NOT rejected either — a
real regression relative to today's exact-2-character constraint, knowingly traded for
layer consistency.

## Risks / Trade-offs

- **[Risk] A PR adds a language to `VALID_LANGUAGES` without a paired migration.** →
  Mitigated by Decision Q1's recommended Option C test, once approved and implemented.
- **[Risk] Constraint-name drift ships silently** (dropping the wrong, Drizzle-schema-labeled
  constraint name leaves the old 2-char check active). → Named explicitly in Context above;
  `tasks.md` requires the migration to target the real applied name
  (`language_cd_length_check`) and both files to agree on the new name afterward.
- **[Risk] Option B's CHECK pattern (if chosen) silently diverges from `resolveLocale.ts`'s
  pattern over time** if one is edited without the other being reviewed. → No automated check
  proposed for this (would require extracting the regex into one shared pragmatic-BCP-47
  module imported by both the Drizzle schema and `resolveLocale.ts` — considered and rejected
  as overbuilding for a change that isn't adding a real variant yet; flagged here instead as a
  known, accepted risk for a human reviewer to weigh against Decision Q3).
- **[Risk] Concurrent-callers class does not apply here** — `VALID_LANGUAGES` is an immutable,
  module-load-time constant and `getAvailableLanguages()` performs a synchronous
  (`readdirSync`) disk scan with no memoization/caching introduced by this change; there is no
  async-accessed shared mutable state in scope. Noted explicitly so a reviewer does not treat
  its absence as an oversight.

## Migration Plan

1. Update `app/domains/shared/infrastructure/languageTable.ts`: widen `languageCd` to
   `varchar(35)`, rename the Drizzle `check(...)` identifier to the new name chosen once Q3 is
   resolved (e.g. `language_cd_format_check`), update the CHECK expression to match.
2. Hand-author one new migration file (never edit the two already-applied ones):
   - `ALTER TABLE public.language ALTER COLUMN language_cd TYPE varchar(35);`
   - `--> statement-breakpoint`
   - `ALTER TABLE public.language DROP CONSTRAINT language_cd_length_check;` (the real applied
     name, confirmed in Context above — not the Drizzle schema file's label)
   - `--> statement-breakpoint`
   - `ALTER TABLE public.language ADD CONSTRAINT language_cd_format_check CHECK (...);` (exact
     expression per Decision Q3's resolution)
   - Register it in `app/drizzle/migrations/meta/_journal.json` the same way
     `20261009091033_alter_language_table.sql` was registered — a journal entry only, no
     snapshot file. (Correction: `20261009091033` itself has no snapshot file of its own —
     `app/drizzle/migrations/meta/` holds no snapshot newer than `20250811095649` — so "its
     snapshot" in this plan's original wording was inaccurate; the actual, followed precedent
     is journal-entry-only.)
   - Apply with `yarn dbsync` — never `drizzle-kit push`.
3. No existing `language` rows are affected (all are 2-character codes, which satisfy both
   candidate CHECK patterns and the new column width) — this migration is additive/widening
   only, no data rewrite, no rollback-sensitive data loss. Rollback is a second migration
   narrowing the column back and restoring the old constraint name/expression, only possible if
   no row created in the interim violates the old shape.
4. Update `app/backend.server/translations.ts`: delete `availableLanguagesWhiteList`; import
   and filter against `VALID_LANGUAGES` from `~/utils/lang.backend`.
5. Update `app/shared/i18n/resolveLocale.ts`: replace `matchAcceptLanguage`'s single-step
   primary-subtag fold with progressive truncation (Decision Q2).
6. Amend `_docs/decisions/ADR-001-multilingual-strategy.md` with a dated addendum (status
   stays `Proposed`; this is additive).

## Decisions Finalized During Review

Decisions Q1, Q2, and Q3 were all resolved on 2026-10-12 (see the Decisions section above):
Q1 as recommended (Option C, PGlite migration-replay consistency test — the alternative of
making the `language` DB table itself the sole source of truth was raised and rejected, see
Q1's own write-up for why); Q2 as recommended in full (full-tag variant rows, progressive
truncation, no exact-vs-broader guessing, no case-folding); Q3 **overriding** the
recommendation — Option A (reuse `resolveLocale.ts`'s existing permissive pattern) was chosen
over the recommended Option B, for one consistent "looks like BCP-47" mental model across the
request and DB layers, accepting that `"en-fil"` and single-character codes are no longer
rejected at the DB layer (recorded as explicit scenarios in
`specs/shared-translation-schema/spec.md`, not silently dropped).
