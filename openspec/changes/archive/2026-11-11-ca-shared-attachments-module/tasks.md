**Decided (design.md Decision 7, confirmed with the human)**: `promote()`/`delete()` run inside
the same `transactionRunner.run()` callback as the DB write, before that callback returns — not
after commit. Tasks 3.2/4.2/4.3/5.1 are written to this ordering.

## 1. Shared attachments module

- [x] 1.1 Write failing unit tests for `LocalDiskAttachmentStorageAdapter.promote()`/`delete()`/
      `stage()`/`retrieve()` against a fake/temp filesystem fixture (not PGlite — no DB involved),
      covering: successful promote, successful delete, delete of a non-existent file is a no-op,
      path-traversal attempt in a staged filename stays within the tenant's own directory tree, two
      concurrent `promote()` calls for the same owner both succeed and neither removes the other's
      file. Verify: `yarn vitest run app/domains/shared/attachments/infrastructure/
LocalDiskAttachmentStorageAdapter.test.ts` fails (red).
- [x] 1.2 Create `IAttachmentStoragePort` (`app/domains/shared/attachments/application/
ports/IAttachmentStoragePort.ts`) per design.md Decision 3.
- [x] 1.3 Implement `LocalDiskAttachmentStorageAdapter` (`app/domains/shared/attachments/
infrastructure/LocalDiskAttachmentStorageAdapter.server.ts`) deriving every path from
      `descriptor.tenantId`/`ownerType`/`ownerId` plus a sanitized basename, writing to
      `uploads/tenant-{id}/{ownerType}/{ownerId}/`, matching `HAZARDOUS_EVENT_UPLOAD_PATH`'s existing
      layout for `ownerType = "hazardous-event"`. Verify: 1.1's test file passes (green).
- [x] 1.4 Add `AttachmentStoragePortToken.ts` and `SharedAttachmentStorageModule.server.ts`
      (`@Module` with `providers`/`exports`, hidden-token convention) per
      `ValidationWorkflowModule`'s existing pattern. Verify: `yarn tsc` clean on the new files.
- [x] 1.5 Refactor: review 1.1-1.4 for duplication/clarity. Verify: 1.1's tests stay green after
      any refactor.

## 2. Schema

- [x] 2.1 Write failing PGlite integration tests in a rewritten
      `tests/integration/db/queries/hazardousEventAttachment.test.ts` covering: File-type insert
      succeeds with `url`/`tag` null, Link-type insert succeeds with file columns null, a row with a
      `tag` JSON array round-trips, `type = NULL` is rejected, a File-type row missing any file
      column is rejected by the check constraint, a File-type row with a non-null `url` is rejected,
      a Link-type row missing `url` is rejected, a Link-type row with any non-null file column is
      rejected, plus the pre-existing cascade-delete and concurrent-insert scenarios carried forward
      unchanged. Verify: `yarn vitest run tests/integration/db/queries/hazardousEventAttachment
.test.ts` fails (red) against the current schema.
- [x] 2.2 Reshape `hazardousEventAttachmentTable.ts`: add `url` (nullable `text`), `tag`
      (nullable `jsonb`), `type` (`pgEnum("hazardous_event_attachment_type", ["File", "Link"])`,
      `NOT NULL`), drop `NOT NULL` from `fileKey`/`fileName`/`fileType`/`fileSize`, add the
      type-matching `check()` constraint per design.md Decision/spec
      `hazardous-event-attachment-schema`.
- [x] 2.3 Author the Drizzle migration by hand (statements in order, `-->
statement-breakpoint` between each): add columns nullable → backfill
      `UPDATE hazardous_event_attachment SET type = 'File' WHERE type IS NULL` → set `type NOT NULL`
      → add the check constraint. Run `yarn dbsync`. Verify: migration applies cleanly against a
      fresh PGlite/test DB and against a DB seeded with a pre-change-shaped row.
- [x] 2.4 Update `tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` to mirror the
      reshaped table (P1-42 convention). Verify: 2.1's test file passes (green).
- [x] 2.5 Refactor: review schema file and migration for clarity/duplication. Verify: 2.1's tests
      stay green.

## 3. Domain type and route-adapter parsing

- [x] 3.1 Write a failing unit test for `parseHazardousEventFormData.server.ts`'s attachment
      parsing using a real `ContentRepeater`-shaped fixture (not a hand-constructed
      already-correct one): a File-type item, a Link-type item, a Link-type item with a stale
      leftover `file` object, a File-type item with a stale leftover `url`, and a non-UUID
      client-supplied `id`. Verify: `yarn vitest run app/domains/hazardous-events/presentation/web/
parseHazardousEventFormData.server.test.ts` fails (red).
- [x] 3.2 Update `HazardousEventAttachmentProps` (`HazardousEvent.ts`) to add `type`/`url`/`tag`,
      make `fileKey`/`fileName`/`fileType`/`fileSize` optional. Rewrite `isAttachmentProps()`/
      `parseAttachments()` in `parseHazardousEventFormData.server.ts` to accept the real widget
      shape and derive the persisted field set from `file_option` per spec
      `hazardous-event-write-route-adapter`. Verify: 3.1 passes (green).
- [x] 3.3 Refactor: review parsing logic for clarity. Verify: 3.1 stays green.

## 4. Use-case wiring — create/update

- [x] 4.1 Write failing integration tests for `CreateHazardousEventUseCase` (PGlite): a File-type
      attachment is promoted and its row's `file_key` points at the permanent location; a Link-type
      attachment needs no promote call; a promote failure leaves no `HazardousEvent`/
      `WorkflowInstance`/attachment row persisted. Verify: `yarn vitest run
app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` fails (red)
      for the new cases.
- [x] 4.2 Inject `IAttachmentStoragePort` into `CreateHazardousEventUseCase`; call `promote()`
      for each `File`-type attachment inside the same `transactionRunner.run()` callback as the
      entity insert, before the attachment rows are written, using the use case's own generated
      event `id` as `descriptor.ownerId`. Verify: 4.1 passes (green).
- [x] 4.3 Write failing integration tests for `UpdateHazardousEventUseCase` (PGlite): a new
      File-type attachment is promoted; a removed File-type attachment's file is deleted; a removed
      Link-type attachment triggers no file-storage call; an absent `attachments` field leaves
      existing files untouched. Verify: fails (red) for the new cases.
- [x] 4.4 Inject `IAttachmentStoragePort` into `UpdateHazardousEventUseCase`; before the
      delete-all-reinsert of attachment rows, diff the existing File-type attachments' `file_key`s
      against the new collection's, call `delete()` for each removed one and `promote()` for each
      new `File`-type item, inside the same transaction. Verify: 4.3 passes (green).
- [x] 4.5 Update `DrizzleHazardousEventRepository.server.ts`'s insert/read mapping for the new
      columns (`type`/`url`/`tag`) and to mint a fresh `crypto.randomUUID()` per attachment row at
      insert time (design.md Decision 6), instead of using the caller-supplied `id`. Verify: the
      PGlite repository test (`DrizzleHazardousEventRepository.test.ts`) still passes, plus a new
      case asserting a non-UUID input `id` does not reach the insert.
- [x] 4.6 Refactor: review Create/Update use-case diffing and promote/delete call sites for
      duplication (shared helper if the diff logic repeats). Verify: 4.1 and 4.3 stay green.

## 5. Use-case wiring — delete

- [x] 5.1 Write failing integration tests for `DeleteHazardousEventUseCase` (PGlite): deleting an
      event with a File-type attachment deletes its on-disk file; deleting an event with only
      Link-type attachments makes no file-storage call; a blocked delete (dependents exist) leaves
      the attachment and its file untouched. Verify: fails (red) for the new cases.
- [x] 5.2 Inject `IAttachmentStoragePort` into `DeleteHazardousEventUseCase`; call `delete()` for
      each `File`-type attachment belonging to the event, inside the same transaction, before the
      dependent-check short-circuit returns and before the row delete. Verify: 5.1 passes (green).
- [x] 5.3 Update `HazardousEventsModule.server.ts` to import `SharedAttachmentStorageModule` and
      provide `IAttachmentStoragePort` to all three use cases. Verify: `yarn tsc` clean; module
      bootstraps without a DI resolution error (existing module-wiring test, if any, still passes).
- [x] 5.4 Refactor: review for consistency across all three use cases' storage-port call sites.
      Verify: 1.1, 2.1, 3.1, 4.1, 4.3, 5.1 all stay green.

## 6. Detail page attachments table (presentation-only gap, folded in per design.md Decision 9)

- [x] 6.1 Write failing tests in `HazardousEventDetailPage.test.tsx` covering: an attachment
      with tags renders them joined by `, `; an attachment with a null/empty `tag` renders `—`; a
      `type: "File"` attachment renders an `<a>` whose `href` contains
      `name={eventId}/{fileKey}` (not `fileName`) and whose visible text is `attachment.fileName`;
      a `type: "Link"` attachment renders an `<a href={attachment.url}>` with
      `target="_blank" rel="noopener noreferrer"`; the existing empty-state test
      (`t("detail.attachments_none")`) still passes unmodified. Verify: `yarn vitest run
app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` fails (red)
      for the new cases.
- [x] 6.2 Add `detail.attachments_table.columns.{title,tags,file_url}` to
      `locales/en/hazardous-events.json`, siblings of the existing `detail.fields`/
      `detail.spatial_observation` objects, and to this test file's inline locale mirror (Notices
      precedent — no file import in the test).
- [x] 6.3 Replace the `<ul>`/`<li>` block in `HazardousEventDetailPage.tsx` (~L142-150) with a
      `Table`/`TableColumn`/`TableRow`/`TableCell` (`app/design-system/components/`) rendering
      Title/Tags/File-URL per column, per design.md Decision 9's ground-truth checklist: tags
      joined by `.name` with `"—"` for null/empty (not legacy's `"N/A"`); a File-type cell as a
      plain `<a>` (not the design-system `Link`) built via
      ``ctx.url(`/hazardous-event/file-viewer?name=${encodeURIComponent(data.id)}/${encodeURIComponent(attachment.fileKey)}`)``
      with `attachment.fileName` as its visible text; a Link-type cell as a plain
      `<a href={attachment.url}>`; both links `target="_blank" rel="noopener noreferrer"`; the
      existing `data.attachments.length === 0` branch and its `t("detail.attachments_none")` text
      left untouched. Verify: 6.1 passes (green).
- [x] 6.4 Refactor: review the new table-rendering block for clarity/duplication against the
      rest of the page's existing field-rendering style. Verify: 6.1 stays green.

## 7. End-to-end verification

- [x] 7.1 Write a Playwright E2E test exercising the real `AttachmentsFormView` widget on the HE
      create/edit route: upload a file, add a link, save, reload the detail/edit page, confirm both
      the uploaded file and the link are still present and the file is viewable via the unchanged
      `/hazardous-event/file-viewer` route. Verify: `yarn test:e2e` (scoped to this spec) passes.
- [ ] 7.2 Invoke `test-quality-auditor`, scoped to every file changed under `app/domains/**` in
      this change (the shared adapter, the reshaped repository mapping, the three use cases, the
      parser) — these all contain real implementation logic, not type-only interfaces. Resolve any
      real gap it finds. **Deliberately skipped** per explicit user decision, 2026-11-11 — not
      run, not deferred-register logged; archiving without it.

## 8. Quality gates

- [x] 8.1 Gate 1: `yarn vitest run` across every test file touched/added in this change — all
      green, including section 6's new/updated detail-page test.
- [x] 8.2 Gate 2: `yarn tsc` — zero errors.
- [x] 8.3 Gate 3: `yarn format:check` scoped to this change's files — clean. Resolved: diffed
      each of the 5 previously-dirty files against a formatted copy before writing (per this
      project's own "preview before --write" convention) — 4 of 5 were pure CRLF/line-wrap noise,
      confirmed zero real content change; applied `--write` to the real files. The 5th
      (`hazardous-event-write-route-adapter/spec.md`) hit the known non-convergent markdown
      pitfall (prettier wants to strip a correct 2-space list-continuation indent inside a
      backtick code span) — hand-fixed for correct markdown; `prettier --check` will keep
      flagging this one file going forward, per the documented precedent for this exact issue,
      not a new problem.
- [x] 8.4 Gate 4: Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` —
      scoped to section 6; no issues found.
- [x] 8.5 Gate 5: `solid-reviewer` agent review — scoped to section 6; one SRP finding (File/URL
      link-building logic inlined in JSX), resolved by extracting `attachmentLink.ts`.
- [ ] 8.6 Gate 6: Documentation review — full-diff sweep by a fresh subagent. INCOMPLETE: the
      subagent paused mid-sweep after a scope correction (see final report) with several
      sections-1-5 files still unreviewed; section 6's own comments were compacted.
- [x] 8.7 Gate 7: Project conventions review against `.github/copilot-instructions.md` — scoped
      to section 6; consistent with this file's own established (non-legacy) conventions.
- [x] 8.8 Gate 8: Code review via a fresh subagent — scoped to section 6. Findings (vacuous
      test, missing table/header test, undocumented `?? ""` null-fallback) resolved.
- [x] 8.9 Gate 9: Visual/UX parity review — verified live via browser automation. File-type link
      end-to-end (200 response, correct bytes, correct href-from-fileKey/label-from-fileName
      split, `target`/`rel`); Link-type tags join + `"—"` fallback; table structure/styling
      matches the list page's own `dts-table` precedent. `focusChild` keyboard-reachability gap
      found and fixed (confirmed via live ArrowRight navigation). Link-colour (bare `<a>` renders
      with inherited/black text, no blue) confirmed NOT a deviation: Tailwind's global
      `preflight.css` (`a { color: inherit }`, loaded app-wide via `app/styles/all.css`) resets
      every bare anchor identically, including legacy's own identical unstyled `<a>` in
      `attachmentsView.tsx` -- this is a pre-existing, app-wide condition, not something this
      change introduces or that differs from legacy's actual rendering. **Post-handback addendum
      (2026-11-11, found live by the human)**: row height still taller than legacy's despite the
      above. Root-caused and fixed — see design.md Decision 9 Addendum (`TableCell`/`TableColumn`
      gained an opt-in `compact` prop; an earlier CSS-class attempt was confirmed ineffective
      against the components' own inline `height` style). Verified live: 37.35-37.75px vs.
      legacy's 37.8px; HE list page's own rows (not passing `compact`) confirmed unchanged at 54px.
- [x] 8.10 Gate 10 (Claude Code only): independent second-opinion review via a fresh subagent
      invoking the `code-review` skill (an approximation of the built-in platform feature, not
      necessarily the built-in itself — see final report). Finding (Title cell had no empty-value
      fallback) resolved via `orDash()`.

## 9. Regression and archive

- [x] 9.1 Run `yarn test:run2` (full PGlite suite) — re-run with the dev server stopped (no more
      "Worker exited unexpectedly" noise): 2415 passed, 11 failed, 3 skipped. Confirmed genuinely
      pre-existing and unrelated, not assumed: `git stash`-ed this entire change's working tree
      and re-ran just the 3 failing files against the clean baseline — identical 11 failures,
      identical error messages (`app.getHttpAdapter is not a function` in
      `HttpServerBootstrap.test.ts`/`UnifiedSinglePortServer.test.ts`; one unrelated
      `settingsService.languagePersistence.test.ts` failure). Stash restored afterward, working
      tree confirmed intact (43 entries, matching before).
- [x] 9.2 Run `opsx:archive` on this branch before raising the PR.
