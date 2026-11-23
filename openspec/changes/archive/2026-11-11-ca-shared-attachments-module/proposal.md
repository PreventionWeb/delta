## Why

`6c`'s `hazardous_event_attachment` table (`id`/`title`/`file_key`/`file_name`(`NOT NULL`)/
`file_type`(`NOT NULL`)/`file_size`(`NOT NULL`)) cannot represent what the reused legacy widget
(`app/frontend/attachmentsFormView.tsx`/`ContentRepeater`) actually submits: items shaped
`{id, title, tag, file_option: "File"|"Link", file: {name, tenantPath, content_type}, url}`.
Confirmed by reading `parseHazardousEventFormData.server.ts`'s `isAttachmentProps()`: it requires
`fileKey`/`fileName`/`fileType`/`fileSize` on every item, none of which the widget ever produces,
so `parseAttachments()` filters out every real attachment before it reaches
`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` — silent, total data loss on every
save, not a missing feature. Separately, confirmed by reading `DrizzleHazardousEventRepository
.server.ts`/`CreateHazardousEvent.ts`/`UpdateHazardousEvent.ts`: even once attachment rows reach
the table, nothing ever calls the file-promotion step (`ContentRepeaterUploadFile.save()`'s
equivalent) — uploaded files stay in `uploads/temp/` indefinitely, and nothing calls a delete
equivalent when a `HazardousEvent` is hard-deleted, leaking files on disk permanently. This is
scoped with the human (2026-11-05, roadmap `6i`/`DEF-054`) as: fix the write-path shape mismatch,
add the missing promote/delete file-storage step, and do it through a new shared (not
HE-embedded) attachments module, since the same generic-subdomain need will recur for
Disaster Events' own future migration (`DEF-013`).

## What Changes

- **New shared module** `app/domains/shared/attachments/` owns an `IAttachmentStoragePort`
  (`application/ports/`) and a from-scratch local-disk adapter (`infrastructure/`) — see
  design.md Decision 1 for why this is a new adapter that matches legacy's on-disk layout for
  read-compatibility, rather than a wrapper around `ContentRepeaterUploadFile`'s existing
  `save()`/`delete()` methods (which have two concrete, confirmed defects unsafe to carry into
  new CA code: a client-controlled `tenantPath` candidate tried before the server-derived tenant
  path, and destructive "delete anything in the destination directory not in the current items
  list" cleanup). Legacy's own widget, its pre-upload (`/hazardous-event/file-pre-upload`) and
  file-viewer (`/hazardous-event/file-viewer`) routes, and the on-disk `uploads/tenant-{id}/
hazardous-event/{eventId}/` layout they already use are **unchanged** — the new adapter writes
  to and reads from that same layout, it does not replace it.
- **Reshape `hazardous_event_attachment`**: add `url` (nullable `text`), add `tag` (nullable
  `jsonb` — the widget's tokenfield emits an array of `{id, name}`-shaped objects, confirmed by
  `attachmentsFormView.tsx`'s own render code, not a bare string list), make `file_key`/
  `file_name`/`file_type`/`file_size` nullable, add a `type` discriminator (`pgEnum`, values
  `"File"`/`"Link"`, matching the widget's own `file_option` values exactly), and a `check()`
  constraint enforcing type-correct field population — pattern mirrors `eventCausalityTable`'s
  existing `event_causality_triggering_entity_fk_check`. **BREAKING (schema-internal only)**:
  existing rows get `type = 'File'` backfilled (every existing row was inserted by the
  already-correctly-shaped test fixture path, never by the real widget, per `DEF-054`'s own
  finding) before `type` becomes `NOT NULL`.
- **Fix `parseHazardousEventFormData.server.ts`**: accept the widget's real item shape;
  discard the client-supplied `id` (confirmed non-UUID — `ContentRepeater`'s own
  `index.tsx` mints new-item ids as `Date.now().toString()`, which the `uuid`-typed primary key
  column cannot store) and let the repository mint a fresh UUID per row on every write, matching
  the table's existing insert-fresh-every-time (delete-all-reinsert) semantics; defensively null
  out the field set that doesn't match the item's own `file_option` (the widget's type-switch
  control toggles visibility only, it does not clear the other field's stale value).
- **Wire `CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase`** to call the new port's
  `promote()` for File-type attachments as part of the write (moving the file from `temp/` to its
  permanent per-event directory) and **`DeleteHazardousEventUseCase`** to call `delete()` for
  each File-type attachment being removed — this last wiring is a necessary completion of the
  port's own `delete()` operation (otherwise it has no caller) and closes the "files orphan on
  disk forever" gap found during this change's own Phase 0 investigation; it is not listed in the
  roadmap's "at minimum" file list but is in scope as the same class of fix.
- Legacy-data backfill of `hazardous_event.attachments` (the pre-existing JSONB column) into the
  normalized table is explicitly **out of scope** — a separate team's Phase M deliverable
  (`DEF-054`/roadmap `6i`, confirmed already decided).
- No anti-corruption-layer bridge — confirmed (roadmap `6i`) that HE attachments are read nowhere
  outside HE's own detail/edit pages.
- **Detail page attachments rendering (found live during this change's own implementation,
  folded into scope per explicit human instruction)**: `HazardousEventDetailPage.tsx` renders
  `data.attachments` as a bare title-only `<ul>`. Legacy's own read-only equivalent
  (`attachmentsView.tsx`) renders a Title/Tags/File-URL table with working file-download and
  external-link cells. `data.attachments` already carries the full shape needed (no DTO/
  mapper/use-case change) — see design.md Decision 9 for the full ground-truth checklist and
  the `fileKey`-vs-`fileName` href-construction detail this fix depends on getting right.

## Capabilities

### New Capabilities

- `shared-attachments-port`: the cross-domain file-storage port (stage/promote/delete/
  retrieve, domain-and-entity-agnostic) and its local-disk adapter, including concurrent-caller
  behavior.

### Modified Capabilities

- `hazardous-event-attachment-schema`: table shape changes (nullable file columns, `url`, `tag`,
  `type` discriminator, mutual-exclusivity check constraint, migration backfill of existing rows).
- `hazardous-event-write-route-adapter`: `parseHazardousEventFormData.server.ts`'s attachment
  parsing now accepts the widget's real shape instead of silently dropping every item.
- `create-hazardous-event`: `CreateHazardousEventUseCase` now promotes File-type attachments from
  temp to permanent storage as part of the write.
- `update-hazardous-event`: `UpdateHazardousEventUseCase` now promotes newly-added File-type
  attachments and deletes the on-disk files of any File-type attachment removed by the update.
- `delete-hazardous-event`: `DeleteHazardousEventUseCase` now deletes the on-disk files of every
  File-type attachment belonging to the event being deleted.
- `hazardous-event-route-adapter`: the HE detail page now renders its attachments as a table
  (Title/Tags/File-URL) with working file-download and external-link cells, instead of a
  title-only list.

## Impact

**Files changed:**

- `app/domains/shared/attachments/application/ports/IAttachmentStoragePort.ts` (new) —
  port interface.
- `app/domains/shared/attachments/infrastructure/LocalDiskAttachmentStorageAdapter.server.ts`
  (new) — adapter implementing the port against the existing `uploads/` layout.
- `app/domains/shared/attachments/infrastructure/AttachmentStoragePortToken.ts` (new) — DI
  token, hidden-token convention per `ValidationWorkflowModule`.
- `app/domains/shared/attachments/infrastructure/SharedAttachmentStorageModule.server.ts`
  (new) — NestJS module wiring the port/adapter for domains to import.
- `app/domains/hazardous-events/infrastructure/hazardousEventAttachmentTable.ts` (modified) —
  reshaped columns, enum, check constraint.
- A new Drizzle migration under `app/drizzle/migrations/` (new) — schema change + `type` backfill.
- `tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` (modified) — mirror schema.
- `app/domains/hazardous-events/domain/HazardousEvent.ts` (modified) — `HazardousEventAttachmentProps`
  gains `url`/`tag`/`type`, file fields become optional.
- `app/domains/hazardous-events/presentation/web/parseHazardousEventFormData.server.ts`
  (modified) — real-shape parsing, id discard, type-conditional field nulling, malformed-input
  now throws `ValidationError` instead of silently dropping (implementation finding: a dropped
  item now means "removed" on Update, which deletes a real file — see design.md).
- `app/domains/hazardous-events/application/dto/HazardousEventAttachmentInput.ts` (new) —
  parser's pre-resolution attachment shape (implementation finding: `HazardousEvent.create()`
  can't validate a File row before `promote()` assigns it a real `fileKey`/`fileSize`, which
  only happens inside the write transaction, so the Command layer needs a distinct raw shape
  from the domain's `HazardousEventAttachmentProps`).
- `app/domains/hazardous-events/application/use-cases/resolveAttachmentsForWrite.ts` (new) —
  shared Create/Update attachment-resolution helper (promote new File items, carry forward
  unchanged existing ones, compute removed fileKeys to delete).
- `app/domains/hazardous-events/presentation/web/mapAttachmentsToWidgetShape.ts` (new) —
  **read-path fix, not originally scoped**: the HE edit route was passing the domain
  `HazardousEventAttachmentProps[]` shape straight into `AttachmentsFormView`'s `initialData`,
  which expects the widget's own native shape (`{file_option, file, url, tag}`) — confirmed by
  reading the widget's render code; without this mapper every existing attachment renders as
  "N/A" and the edit dialog's file/url/tag fields are blank. Reverse of the parser's own mapping.
- `app/domains/hazardous-events/presentation/web/HazardousEventFormPage.tsx` (modified) —
  `initialValues.attachments` now typed as the widget's native shape (`AttachmentWidgetItem`),
  supplied pre-mapped by the route loader.
- `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx` (modified) — maps
  `event.attachments` through `mapAttachmentsToWidgetShape` before passing to
  `HazardousEventFormPage`.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (modified) —
  promote wiring; `HazardousEvent.create()` itself moved inside the transaction, after
  attachment resolution (promote() must run inside the transaction per Decision 7, and can't
  precede the entity validation that needs its result).
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (modified) —
  promote/delete wiring.
- `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.ts` (modified) —
  delete wiring.
- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts`
  (modified) — insert/read mapping for new columns, fresh UUID minting.
- `app/domains/hazardous-events/infrastructure/HazardousEventsModule.server.ts` (or equivalent DI
  wiring file — exact name confirmed at implementation time) (modified) — inject the shared
  storage port into the three use cases above.
- `tests/integration/db/queries/hazardousEventAttachment.test.ts` (rewritten) — covers the new
  columns/constraint instead of the old fixed shape.
- New PGlite integration tests for the reshaped table's concurrent-access and type-check
  scenarios; new unit tests for the port/adapter; new Playwright E2E for the real widget flow.
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` (modified) —
  replaces the bare `<ul>` attachments rendering with a `Table`/`TableColumn`/`TableRow`/
  `TableCell` (Title/Tags/File-URL), per design.md Decision 9. Presentation-only; no DTO,
  mapper, use-case, or query change.
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (modified) — covers tags rendering, File-type download link, Link-type hyperlink, and the
  unchanged empty state.
- `app/domains/hazardous-events/presentation/web/attachmentLink.ts` (new) +
  `attachmentLink.test.ts` (new) — pure helper, extracted from `HazardousEventDetailPage.tsx`
  during the Refactor loop (SOLID/SRP finding), resolving an attachment's File/URL cell to an
  href+label pair; same sibling-helper pattern as `hazardLabel.ts`/`workflowStatusDisplay.ts`.
- `locales/en/hazardous-events.json` (modified) — new `detail.attachments_table.columns.*`
  keys for the new table's column headers.

**DB migration required:** yes — `yarn dbsync` only, with a backfill `UPDATE` for existing rows'
`type` column before it becomes `NOT NULL`, using `--> statement-breakpoint` between statements.

**Test approach:** PGlite (`yarn test:run2`) for schema/repository/use-case integration tests,
using a real `ContentRepeater`-shaped payload (not a hand-constructed already-correct fixture —
`DEF-054`'s own finding about the existing test's blind spot). Unit tests (Vitest) for the new
port/adapter in isolation (fake filesystem, no PGlite). Playwright E2E for the real
`AttachmentsFormView` widget end-to-end (upload a file, add a link, save, reload, confirm both
persist). The detail-page attachments table (Decision 9) is covered by `HazardousEventDetailPage
.test.tsx`'s existing Vitest SSR-render pattern (`renderToString` + inline i18n fixture) — no
new test infrastructure needed.

**Security / multi-tenancy implications:** the new local-disk adapter must derive every on-disk
path solely from the server-side session `tenantId` and a validated event id/filename — never
from client-supplied path fragments (the defect found in legacy's `ContentRepeaterUploadFile
.save()`, see design.md Decision 1). This is a security-sensitive change: a path-construction bug
here is a path-traversal or cross-tenant-file-read risk, not just a correctness bug.
