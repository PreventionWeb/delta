## 0. Human sign-off gate (blocking — do not start Section 1 until resolved)

- [x] 0.1 Resolved 2026-10-12 (design.md Decisions section): Q1 = Option C (PGlite
      migration-replay consistency test), as recommended. Q2 = as recommended in full
      (full-tag variant rows, progressive truncation, no exact-vs-broader guessing, no
      case-folding). Q3 = **Option A** (reuse `resolveLocale.ts`'s permissive pattern),
      overriding the recommended Option B — accepting that `"en-fil"` and single-character
      codes are not rejected at the DB layer, in exchange for one consistent mental model
      across the request and DB layers. `design.md` and
      `specs/shared-translation-schema/spec.md` are already updated to match.

## 1. `language` table schema widening (Decision Q3)

- [x] 1.1 Update `tests/integration/db/queries/language.test.ts`: replace the 3-char/22001
      truncation test with an assertion matching Option A's pattern (varchar(35) width;
      `^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$` CHECK). Add success cases for `sr-Latn`, `es-419`. The
      existing 1-char/23514 rejection test must be **inverted**, not removed — Option A
      accepts a single-character code (design.md Decision Q3, accepted regression); assert the
      insert now succeeds. Add a case confirming `"en-fil"` is also accepted (accepted gap, not
      a bug — see the spec delta's explicit scenario). Verify red:
      `yarn vitest run tests/integration/db/queries/language.test.ts`.
      Also added a `23514` rejection case (`"sr_Latn"`, underscore) — the spec delta has no
      explicit rejection scenario, but without one no test exercises the new CHECK expression
      at all, which the Section 6.11 mutation audit would flag.
- [x] 1.2 Widen `app/domains/shared/infrastructure/languageTable.ts`: `languageCd` to
      `varchar(35)`, rename the `check(...)` call's identifier away from
      `language_language_cd_length_check` to the new name chosen in Decision Q3 (e.g.
      `language_cd_format_check`), update the CHECK SQL expression. Verify green:
      `yarn vitest run tests/integration/db/queries/language.test.ts`.
- [x] 1.3 `tests/integration/db/testSchema/languageTable.ts` re-exports the real schema file —
      confirm no edit is needed and the PGlite `pushSchema` harness in
      `tests/integration/db/setup.ts` picks up the widened column automatically (it builds
      from the Drizzle schema, not migration SQL — see design.md Context).
- [x] 1.4 Hand-author a new migration file under `app/drizzle/migrations/` (never edit the two
      already-applied ones: `20261009042834_...` and `20261009091033_...`):
      `ALTER TABLE public.language ALTER COLUMN language_cd TYPE varchar(35);` then
      `--> statement-breakpoint` then
      `ALTER TABLE public.language DROP CONSTRAINT language_cd_length_check;` (the real
      applied constraint name, confirmed in design.md Context — not the Drizzle schema
      file's `language_language_cd_length_check` label) then `--> statement-breakpoint` then
      `ALTER TABLE public.language ADD CONSTRAINT <new_name> CHECK (...);` with the Decision
      Q3 expression. Register it in `app/drizzle/meta/_journal.json` and add its snapshot,
      following the same pattern as `20261009091033_alter_language_table.sql`'s entry.
      Created `app/drizzle/migrations/20261012000000_widen_language_cd_bcp47.sql`, wrapped in
      its own `BEGIN`/`COMMIT` following the `20261011000000` precedent (the two migrations
      before it embed their own `COMMIT` with zero breakpoints, closing the migrator's outer
      transaction early). **Correction to this task's own wording**: `app/drizzle/meta/`
      does not exist — the real path is `app/drizzle/migrations/meta/`. **Correction to "and
      add its snapshot"**: the cited precedent, `20261009091033`, has no snapshot file of its
      own (confirmed: `app/drizzle/migrations/meta/` has no snapshot newer than
      `20250811095649`, and none of the three most recent hand-authored migrations added one).
      Followed the real precedent — journal entry only (`idx: 60`), no snapshot file.
- [x] 1.5 Apply the migration: `yarn dbsync` (never `drizzle-kit push`). Verify it applies
      cleanly against a scratch/dev database.
      Applied against local dev DB (`dts_development`) and verified empirically via direct
      SQL: `language_cd_format_check` present with the correct expression,
      `language_cd_length_check` absent, `character_maximum_length` is 35, and the 9
      `language_cd` values still match `VALID_LANGUAGES` exactly.

## 2. Single source of truth for supported languages (Decision: consolidate on `VALID_LANGUAGES`)

- [x] 2.1 Write a failing unit test asserting `getAvailableLanguages()`
      (`app/backend.server/translations.ts`) includes `"zh"`, `"fr"`, `"es"`, and `"tg"` when
      their locale files exist on disk (currently excluded by `availableLanguagesWhiteList`).
      Place it alongside existing coverage for this function, or extend
      `tests/integration/db/services/settingsService.languagePersistence.test.ts`'s pattern
      with a new `*.test.ts` file. Verify red: `yarn vitest run <new-test-file>`.
      Placed at `tests/unit/backend.server/translations.test.ts` (not co-located with the
      source file — `app/backend.server/**` is not in `vitest.config.ts`'s `include` globs).
      Also covers the spec's two exclusion scenarios via a mocked `VALID_LANGUAGES`.
- [x] 2.2 Delete `availableLanguagesWhiteList` from `app/backend.server/translations.ts`;
      import `VALID_LANGUAGES` from `~/utils/lang.backend` and filter disk-discovered
      languages against it instead. Verify green: `yarn vitest run <new-test-file>`.
- [x] 2.3 Run `tests/integration/db/services/settingsService.languagePersistence.test.ts` to
      confirm the existing Albanian-selection scenarios are unaffected:
      `yarn vitest run tests/integration/db/services/settingsService.languagePersistence.test.ts`.
- [x] 2.4 Manually confirm (or add a targeted test) that
      `app/routes/$lang+/settings+/system.tsx`'s Settings page now offers `zh`/`fr`/`es`/`tg`
      as selectable default languages, consistent with design.md's confirmed finding that the
      Dropdown renders raw language codes with no translated-label lookup (no missing-
      translation crash risk).
      Added a targeted persistence test (`updateSettings(..., "zh")` succeeds and survives a
      re-read) to `settingsService.languagePersistence.test.ts`, covering the spec's
      "previously excluded, now accepted" scenario end-to-end through the same code path the
      Settings page uses.

## 3. `resolveLocale` progressive truncation (Decision Q2)

- [x] 3.1 Add failing scenarios to `app/shared/i18n/resolveLocale.test.ts` for: a fully
      specified tag matching an equally-specific supported variant before truncating further
      (`"sr-Latn-RS"` matches `"sr-Latn"` when both `"sr"` and `"sr-Latn"` are supported); a
      less-specific requested tag NOT matching a more-specific supported variant (`"sr"`
      against only `"sr-Latn"` supported, falls through); and regression coverage confirming
      every existing scenario in `openspec/specs/locale-resolution/spec.md` still passes
      unchanged for a `supportedLocales` list of bare primary subtags only. Verify red:
      `yarn vitest run app/shared/i18n/resolveLocale.test.ts`.
      Only the first scenario went red — the "less-specific does not match" case already held
      under the old single-step fold (truncation only ever removes subtags, never adds), so
      it's a characterization/regression guard, not a true red case; noted inline in the test.
      No separate bundled "regression" test added: this file's pre-existing scenarios (q-weighted
      header, region-subtag folding, bare supported tag) already exercise a bare-primary-subtag-only
      `supportedLocales` list and remained green throughout, which is the regression coverage
      task 3.1 asks for — a duplicate test asserting the same three outcomes again would be
      redundant, not additional coverage.
- [x] 3.2 Update `matchAcceptLanguage()` in `app/shared/i18n/resolveLocale.ts`: replace the
      single-step `entry.split("-")[0]` fold with progressive truncation (try the full entry,
      then repeatedly drop the rightmost hyphen-delimited subtag, down to the bare primary
      subtag) against `supportedLocales`. Do not add case-folding (design.md Decision Q2 —
      out of scope). Verify green: `yarn vitest run app/shared/i18n/resolveLocale.test.ts`.

## 4. DB/`VALID_LANGUAGES` consistency check (Decision Q1)

- [x] 4.1 Write `tests/integration/db/queries/languageRegistryConsistency.test.ts` following
      the raw-PGlite-client, migration-replay pattern already established in
      `tests/integration/db/queries/hipsMultilangCorrectionMigration.test.ts` (a separate
      PGlite client, not the shared `dr` from `setup.ts`): replay the migration files that
      create and seed `public.language`
      (`20261009042834_migrate_hips_with_multi_language_support_and_fixed_hipsUUID.sql`,
      `20261009091033_alter_language_table.sql`, and this change's new migration from Task 1.4)
      in order, then assert the resulting `language_cd` set is exactly `new Set(VALID_LANGUAGES)`
      — failing in both directions (a `VALID_LANGUAGES` entry with no row, and a row with no
      corresponding `VALID_LANGUAGES` entry). Verify it passes against the current, correctly
      in-sync state: `yarn vitest run tests/integration/db/queries/languageRegistryConsistency.test.ts`.
      **Implementation discovery, flagged and resolved**: `20261009042834` cannot run standalone
      — it RAISE EXCEPTIONs on exact legacy row counts and FK names that only exist after
      dozens of earlier migrations. See design.md Decision Q1's "Implementation note" for the
      full finding and the minimal-fixture resolution used (table shapes trimmed to what it
      reads, FK names/guarded columns matching the real migrations, not a full 60-file
      replay). `client.exec()` used (not `client.query()`) for the real migration files — each
      contains multiple statements/DO blocks and its own BEGIN/COMMIT. **Revised twice after
      review**: first to read the migration list from `_journal.json` (every entry from
      `20261009042834` onward, in `idx` order) instead of a hardcoded 3-file list; then
      revised again because an idx-only cut would replay every future migration regardless of
      relevance against this test's minimal fixture, breaking on the next unrelated schema
      change (e.g. an unrelated `ALTER TABLE disaster_records`). Final approach: idx-ordered
      journal entries, filtered to the ones whose SQL references `public.language`
      (word-bounded, so it doesn't match a same-named column on another table, e.g.
      `instance_system_settings.language`). Verified against the full journal with no idx
      cutoff: picks exactly `20261009042834`, `20261009091033`, and the new migration;
      correctly excludes both `20261011000000_fix_hips_multilang_corrections.sql` (never
      references `public.language`) and
      `20260108140218_add_language_to_instance_system_settings.sql` (adds a `language`
      _column_ to a different table).
- [x] 4.2 Verify the test actually catches drift: temporarily add an unused entry to
      `VALID_LANGUAGES` locally, confirm the test fails with a clear message naming the
      missing code, then revert the temporary edit. Do not commit the temporary edit.
      Confirmed both directions: adding `"xx-temp-drift-check"` failed with
      `missing: ["xx-temp-drift-check"]`; removing `"tg"` failed with `extra: ["tg"]`. Both
      reverted, re-ran green, `git diff` on the file is clean.

## 5. Documentation

- [x] 5.1 Amend `_docs/decisions/ADR-001-multilingual-strategy.md` with a dated addendum
      (status remains `Proposed`) recording: `availableLanguagesWhiteList` elimination,
      `VALID_LANGUAGES` as the sole application-layer source of truth, the widened
      `language_cd` column, and a reference to this change's Decision Q1 consistency-check
      mechanism.

## 6. Quality gates

- [x] 6.1 All green:
      `yarn vitest run app/shared/i18n/resolveLocale.test.ts tests/integration/db/queries/language.test.ts tests/integration/db/queries/languageRegistryConsistency.test.ts tests/integration/db/services/settingsService.languagePersistence.test.ts tests/unit/backend.server/translations.test.ts`
      (re-run after 6.11 added two more tests to `language.test.ts` — 38 tests total, all
      green)
- [x] 6.2 `yarn tsc` — zero TypeScript errors.
- [x] 6.3 `yarn format:check` on every file touched in Sections 1-5 (run `yarn format` on just
      those paths to fix, never a bulk repo-wide `yarn format`).
      Scoped to `npx prettier --check`/`--write` on exactly the touched files (never bulk
      `yarn format`). `tasks.md`'s task 6.1 line (a multi-line inline code span wrapped across
      list-continuation lines) did not converge under repeated `--write` — a known Prettier
      markdown pitfall; fixed by hand into a single unwrapped line, which then converges.
- [x] 6.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md`.
      No findings: all Drizzle mutations awaited, no swallowed errors/sentinel strings, no
      `any`/unjustified `!`, `language` table correctly has no `countryAccountsId` (Shared
      Kernel reference data, by design), `yarn dbsync` used (never `drizzle-kit push`).
- [x] 6.5 SOLID review — invoke the `solid-reviewer` agent against the changed files.
      No must-fix findings. One documented-and-accepted trade-off noted (the BCP-47 regex is
      duplicated across `resolveLocale.ts`, `languageTable.ts`, and the migration SQL —
      design.md's own Risks section already names this and rejects extracting a shared module
      as overbuilding). `matchByProgressiveTruncation` and the constraint-rename discipline
      both called out as done well.
- [x] 6.6 Documentation review — comments explain WHY not WHAT, compacted without losing
      meaning; one full-diff sweep via a fresh subagent before the final report.
      Fresh-subagent sweep (general-purpose, omitted `subagent_type` explicitly — it defaulted
      to general-purpose, which is the correct fresh-context type for this gate, so the result
      stands) ran twice: once over the initial diff, once re-reading the test file after a
      logic fix changed its comments. User then gave direct, explicit feedback mid-task to be
      stricter than the sweep's own "leave alone" calls — applied a second, harder compaction
      pass across `languageTable.ts`, `resolveLocale.ts`, `resolveLocale.test.ts`, and
      `languageRegistryConsistency.test.ts` (the densest file), cutting every multi-line
      comment the sweep had flagged as borderline, not just the ones it called COMPACT.
      `app/drizzle/migrations/20261012000000_widen_language_cd_bcp47.sql` was reviewed
      read-only only (explicit-approval guardrail — not edited): sweep found 1 of its 3
      comment blocks (constraint-name-drift, 3 lines) compactable to 2; reported to the user
      for a decision, not applied.
- [x] 6.7 Project conventions review against `.github/copilot-instructions.md`.
      Read in full. All applicable conventions followed: `yarn dbsync` only (never
      `drizzle-kit push`), `--> statement-breakpoint` in the hand-authored migration, Prettier
      scoped-only (never bulk `yarn format`), new tests under `tests/` (Vitest, not
      `node:test`), no `countryAccountsId` on `language` (correct — global reference data, not
      tenant-scoped), `testSchema/languageTable.ts` re-exports the real file so no separate
      update was needed for the widened column, none of the "Known bugs — do not reproduce"
      patterns touched. No `.github/agents/` file documents the `language` table or this test
      pattern, so none needed updating.
- [x] 6.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent.
      No must-fix findings. The migration-replay selection logic in
      `languageRegistryConsistency.test.ts` was traced by hand against the real journal/
      migration files and confirmed correct (replays exactly idx 57/58/60, excludes 59). One
      nitpick: `specs/shared-translation-schema/spec.md` had two list-continuation lines
      wrapped mid inline-code-span, failing `prettier --check` — fixed by hand (unwrapped),
      converges, re-verified clean.
- [x] 6.9 Visual/UX parity review — **not required**: this change touches no file under
      `app/domains/*/presentation/` or `app/routes/`; the Settings page's rendered output
      changes only in the _set of options_ a pre-existing Dropdown offers, not its layout or
      navigation affordances (confirmed in design.md). Re-confirmed at close-out via
      `git diff --stat` — no `app/routes/` or `presentation/` path touched. Stated explicitly
      per the gate's own skip condition, not silently omitted.
- [x] 6.10 Independent second-opinion review — Claude Code's built-in `/code-review` at high
      effort via a second, separate fresh subagent; resolve findings before archiving.
      Ran the generic `security-review` skill (distinct from gate 8's DELTA-specific
      checklist, confirmed by the subagent). No must-fix or nitpick findings. Verified by
      hand-analysis (not assumed): the BCP-47 CHECK regex has no ReDoS shape (hyphen
      boundaries make the partition unambiguous), `matchByProgressiveTruncation` always
      terminates and never sees an edge case `resolveLocale`'s prior validation pass hasn't
      already ruled out, and the test's journal-driven path construction is safe given its
      actual trust boundary (repo-controlled `_journal.json`, in-memory PGlite, test-only).
- [x] 6.11 Test quality audit — invoke `test-quality-auditor` scoped to
      `app/domains/shared/infrastructure/languageTable.ts` (the only `app/domains/**` file in
      this change carrying real implementation logic — its CHECK constraint expression).
      Resolve any real gap found.
      Stryker hung and was killed (confirmed via process evidence, no source files touched);
      a structural review substituted. Found two real gaps in
      `tests/integration/db/queries/language.test.ts`: the 35-char upper boundary was never
      pinned exactly (only 7-char success and 36-char failure existed, leaving 8-34 untested),
      and zero-length was never asserted as rejected. Added both: a 35-char exact-boundary
      success test (verified it actually catches a regression by temporarily narrowing the
      column to 34 locally, confirmed the test fails with 22001, then reverted and confirmed
      green) and a zero-length rejection test (23514). Both green; `yarn tsc` and
      `prettier --check` clean.

## 7. Regression and archive

- [x] 7.1 `yarn test:run2` (full PGlite suite) passes with no new failures. If any failure is
      pre-existing, confirm it against the base branch before archiving — do not assume.
      True baseline captured by stashing all implementation changes and running clean, before
      any edit (not a snapshot from a contaminated concurrent run): 113 test files, 1427
      tests, 0 failures, 1 todo. Final run after full implementation: 115 test files, 1439
      tests, 0 failures, 1 todo. The delta (+2 files, +12 tests) is fully accounted for by
      this change's new/extended test files; zero failures in either run, so there is no
      pre-existing-failure question to resolve.
- [x] 7.2 Run `opsx:archive` on this branch before raising the PR.
