## 1. `hazardous_event_attachment` table

- [x] 1.1 Write failing test `tests/integration/db/queries/hazardousEventAttachment.test.ts`
      (`import "../setup"`) covering the base scenarios from spec.md: insert with an existing
      `hazardous_event_id` and all required fields succeeds; `title = NULL` rejected
      (not-null); `file_key = NULL` rejected (not-null); `file_name = NULL` rejected
      (not-null); `file_type = NULL` rejected (not-null); `file_size = NULL` rejected
      (not-null); `file_size = 5000000000` (above int4 range) succeeds and round-trips intact;
      `created_at`/`updated_at` default to the current timestamp when omitted;
      `hazardous_event_id = NULL` rejected (not-null); a `hazardous_event_id` matching no
      `hazardous_event` row rejected (FK). Seed `hazardous_event` rows via the existing
      `testSchema` fixtures used elsewhere in `tests/integration/db/queries/` for this table.
      Run `yarn vitest run tests/integration/db/queries/hazardousEventAttachment.test.ts` —
      fails (table doesn't exist).
- [x] 1.2 Add `app/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable.ts` —
      `id` via `ourRandomUUID()`, `hazardousEventId` uuid not null `.references(() =>
      hazardousEventTable.id, { onDelete: "cascade" })` (importing `hazardousEventTable` from
      `~/drizzle/schema/hazardousEventTable`), `title`/`fileKey`/`fileName`/`fileType` text not
      null, `fileSize` `bigint("file_size", { mode: "number" })` not null, `createdAt`/
      `updatedAt` timestamp(`{ withTimezone: true }`) not null defaulting to
      `CURRENT_TIMESTAMP`, an `index("hazardous_event_attachment_hazardous_event_id_idx")` on
      `hazardousEventId` — per design.md Decisions 1/2/3/4/7.
- [x] 1.3 Add `tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` re-exporting it
      and add it to `tests/integration/db/testSchema/index.ts`. Do NOT add it to
      `app/drizzle/schema/index.ts` — per design.md Decision 7.
      `tests/integration/db/testSchema/hazardousEventTable.ts` already exists — no new barrel
      entry needed for the FK target.
- [x] 1.4 Run `yarn vitest run tests/integration/db/queries/hazardousEventAttachment.test.ts` —
      base scenarios pass.

## 2. Multi-attachment and cascade-delete behavior

- [x] 2.1 Add failing tests (same file, additional `describe`/`it` blocks) covering: two
      attachments with the same `hazardous_event_id` and different `file_key` values both
      succeed; two concurrent inserts of different attachments sharing the same
      `hazardous_event_id` both succeed (no serialization conflict or lost write); deleting a
      `hazardous_event` row cascades to delete its dependent `hazardous_event_attachment`
      rows. Run — fails until 1.2 lands, then passes with no further code change.
- [x] 2.2 Run `yarn vitest run tests/integration/db/queries/hazardousEventAttachment.test.ts` —
      all scenarios pass (spec.md's full set, 1:1).

## 3. Real migration

- [x] 3.1 Hand-author
      `app/drizzle/migrations/20260907160000_add_hazardous_event_attachment_table.sql` — two
      top-level statements separated by a `--> statement-breakpoint` line (Postgres has no
      inline non-unique-index syntax inside `CREATE TABLE`, so this migration structurally
      cannot be a single statement — the `2c` migration-execution bug's exact shape, per
      design.md Decision 10):

      Statement 1: `CREATE TABLE IF NOT EXISTS hazardous_event_attachment` — uuid PK default
      `gen_random_uuid()`; `hazardous_event_id` uuid not null, FK to `hazardous_event(id)`
      `ON DELETE CASCADE`; `title`/`file_key`/`file_name`/`file_type` text not null; `file_size`
      bigint not null; `created_at`/`updated_at` `timestamptz NOT NULL DEFAULT
      CURRENT_TIMESTAMP`.

      Statement 2: `CREATE INDEX hazardous_event_attachment_hazardous_event_id_idx ON
      hazardous_event_attachment (hazardous_event_id)`.

      Same style as `20260907150000_add_hazardous_event_spatial_observation_tables.sql`.

- [x] 3.2 Add the matching entry to `app/drizzle/migrations/meta/_journal.json` (`idx` 52,
      following the `20260907150000_add_hazardous_event_spatial_observation_tables` entry at
      `idx` 51).
- [x] 3.3 Run `yarn dbsync` against a local Postgres and confirm it applies cleanly with no
      errors; verify directly against `information_schema.columns`/
      `information_schema.table_constraints`/`pg_constraint`/`pg_indexes` that the table, the
      FK (`ON DELETE CASCADE`), and the index exist as written. Specifically query
      `is_nullable`/`column_default` on both `created_at` and `updated_at` in
      `information_schema.columns` to confirm `updated_at` was NOT copied from DE's nullable
      shape — it must show `is_nullable = 'NO'` and `column_default` containing
      `CURRENT_TIMESTAMP`, matching `created_at` exactly (per the `2c` migration-execution bug
      — do not trust a clean `yarn dbsync` exit code alone).

## 4. Quality gates

- [x] 4.1 `yarn vitest run tests/integration/db/queries/hazardousEventAttachment.test.ts` —
      green.
- [x] 4.2 `yarn tsc` — zero errors.
- [x] 4.3 `yarn format:check` — clean (scoped `npx prettier --check` on the changed `.ts`
      files; `.sql` has no prettier parser, same as prior migrations; `_journal.json` kept in
      its pre-existing 2-space style — clean append, not a full-file reformat). Preview any
      `--write` on a copy first per known prettier pitfalls (escaped-backtick code spans,
      non-converging list-continuation wraps).
- [x] 4.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      findings.
- [x] 4.5 Invoke `solid-reviewer` agent on the new table file — confirm no SOLID violations.
- [x] 4.6 Documentation review — any comments explain WHY, not WHAT, terse single-line only.
- [x] 4.7 Project conventions review against `.github/copilot-instructions.md` — confirm no
      violations.
- [x] 4.8 Run `.github/skills/code-review/SKILL.md` in full. Confirm every spec.md scenario
      maps 1:1 to a test, no gaps.
- [x] 4.9 Visual/UX parity — N/A, no presentation-layer file is touched by this change.

## 5. Regression and archive

- [x] 5.1 Run `yarn test:run2` on `feature/he-ca-phase2` (this branch's actual base, before any
      change in this diff) first — record the exact pass/fail/total counts and which test(s)
      fail. Run again after this change's implementation. Confirm the same pre-existing
      failure(s), if any, are unchanged and no new failures were introduced — do not label any
      failure "pre-existing" without this baseline comparison.
- [x] 5.2 Run `opsx:archive` on this branch before raising the PR (PR targets
      `feature/he-ca-phase2`, not `dev`).
