## Context

See proposal.md - Why for the root-cause investigation. This section covers only what shapes
the design: the widget's actual output, legacy's existing file-move mechanics, and this
codebase's own conventions for a cross-domain shared module.

**Confirmed widget output shape** (`attachmentsFormView.tsx` `dialog_fields` + `table_columns`
render code, read directly, not assumed): `{id, title, tag, file_option: "File" | "Link", file:
{name, tenantPath, content_type}, url}`. `tag` is produced by a `tokenfield` control
(`dataSource: /api/disaster-event/tags-sectors`) and rendered as `tags.map(t => t.name)` — an
array of `{id, name}`-shaped objects, not a bare string or string array. No field in
`dialog_fields` is marked `required: true`, so `title` can legitimately be `""` (still satisfies
a `NOT NULL text` column — empty string is not `NULL`). The `file_option` toggle
(`onChange`) only flips CSS `display` on the File/Link sub-fields; it does **not** clear
`item.file` or `item.url` when the user switches type, so a submitted item can carry a stale
value in the field that doesn't match its current `file_option`. New-item ids are minted
client-side as `Date.now().toString()` (`ContentRepeater/index.tsx`) — not a UUID.

**Confirmed legacy file-move mechanics** (`ContentRepeaterUploadFile.save()`/`.delete()`,
`UploadFile.tsx`): moves a file from a temp candidate path to `uploads/tenant-{id}/
{destinationPath}/`, tried in this order: (1) a path built from the client-supplied
`item.file.tenantPath` with no traversal normalization, (2) a path built from the server-known
`tenantId`, (3)/(4) older legacy fallback shapes. After a successful move it also deletes every
file already present in the destination directory that isn't in the current items array
("cleanup"), and the whole thing is synchronous `fs` I/O. `processAndSaveAttachments()`
(`attachments.ts`) is the current caller, used only by legacy's own event model, with
`directory = "hazardous-event"` — i.e. the on-disk layout the new adapter must stay compatible
with is `uploads/tenant-{id}/hazardous-event/{eventId}/<filename>`, confirmed also via
`HAZARDOUS_EVENT_UPLOAD_PATH` in `app/utils/paths.ts`. CA's `CreateHazardousEventUseCase`/
`UpdateHazardousEventUseCase`/`DeleteHazardousEventUseCase` call none of this today — confirmed
by reading all three use cases end to end.

**Module placement precedent**: `app/domains/shared/` already exists (`domain/
flexibleDateFormat.ts`, `infrastructure/languageTable.ts` et al. from
`ca-shared-multilang-taxonomy-schema`/`ca-shared-language-registry`) as this codebase's Shared
Kernel location for domain-agnostic, non-business-logic primitives — file storage fits the same
category (a textbook DDD generic subdomain, same class as email-sending or logging). The nearest
port+adapter+DI-module precedent for a reusable capability is `validation-workflow`'s own layout:
`application/ports/I<X>Port.ts`, `infrastructure/<X>Adapter.server.ts`,
`infrastructure/<X>PortToken.ts` (hidden token, not exported from the module), `infrastructure/
<X>Module.server.ts` (`@Module` with `providers`/`exports`), wired with NestJS DI (`useClass`/
`useFactory`).

## Goals / Non-Goals

**Goals:**

- A shared, domain-agnostic attachment file-storage port usable by HE now and DE/DR later,
  without embedding it in HE first (explicit human direction — not following the
  `INotificationPort`/`IValidatorCandidateRepository` "embed then promote" precedent).
- A schema that can actually represent what the widget submits, with a `check()` constraint that
  can't be bypassed by a mismatched `file_option`/field combination.
- Zero change to the widget, its upload/view routes, or the on-disk layout those routes already
  serve.

- Give the HE detail page's read-only attachments view real content (tags, a working file
  download link, a working external-URL link), matching legacy's own equivalent table —
  found live during this change's own implementation (the detail page was still rendering a
  bare title-only `<ul>`) and folded into this change's scope per explicit human instruction,
  not split into a new change.

**Non-Goals:**

- Legacy-data backfill of `hazardous_event.attachments` (JSONB) into the normalized table —
  Phase M's deliverable.
- An anti-corruption-layer bridge for external consumers — none exist (confirmed).
- Disaster Events' own attachment-table consolidation — `DEF-013`, a separate future intent.
- A CA-native upload or file-viewer route — legacy's routes stay the only upload/view path for
  now; see Decision 4 (port surface) for what that means for `stage()`/`retrieve()`.

## Decisions

### Decision 1 — Build a new adapter; do not wrap `ContentRepeaterUploadFile`

The roadmap left this open for this design to resolve with evidence. Evidence against wrapping:
`ContentRepeaterUploadFile.save()` tries a temp-file candidate built from the **client-supplied**
`item.file.tenantPath` before the server-derived `tenantId` candidate — a wrapper inherits that
as a live path-construction input from an untrusted payload, which is a path-traversal /
cross-tenant-read surface, not just an awkward legacy wart. `save()` also deletes every file in
the destination directory not present in the current items array on every call — under two
concurrent saves of the same event (see Decision 5's concurrency scenario) this races a second
caller's just-promoted file for deletion. Both are disqualifying for new, security-sensitive CA
code. The new `LocalDiskAttachmentStorageAdapter` therefore reimplements promote/delete as plain
`async fs` calls, deriving every path from the server-side `tenantId` (never from client input)
plus a validated `eventId` and sanitized basename, writing to and reading from the **same**
`uploads/tenant-{id}/hazardous-event/{eventId}/` layout so legacy's unchanged `/hazardous-event/
file-viewer` route keeps serving files the new adapter promotes. This is not "reinventing file
I/O that already works" (which decision #5 of the roadmap rules out) — the specific mechanics
being replaced are the two defects above, not the layout or the move-on-save concept itself.

**Alternative considered**: thin wrapper calling `ContentRepeaterUploadFile.save()`/`.delete()`
directly. Rejected — inherits both defects above into new code with no mitigation available
short of rewriting the wrapped methods, at which point it isn't a wrapper.

### Decision 2 — Module layout

```
app/domains/shared/attachments/
  application/
    ports/
      IAttachmentStoragePort.ts
  infrastructure/
    LocalDiskAttachmentStorageAdapter.server.ts
    AttachmentStoragePortToken.ts
    SharedAttachmentStorageModule.server.ts
```

A new subfolder under `app/domains/shared/`, not flattened into the existing bare `domain/`/
`infrastructure/` folders — `flexibleDateFormat.ts`/`languageTable.ts` are single concerns with
no port/adapter split; attachment storage is a genuine port+adapter capability and needs the
same `application/ports` + `infrastructure` split every other capability-sized module in this
codebase uses (`validation-workflow`, `hazardous-events`). Named `attachments` (not
`attachment-storage`) per explicit human decision: an earlier draft of this design used
`attachment-storage` to avoid reading as the same concept as `hazardous-events`' own
`HazardousEventAttachmentProps`, but there is no real collision — different directory tree,
different exported names, nothing clashes on disk or at compile time. The human confirmed the
concern was readability-only and preferred the simpler name. The port/adapter/token/module file
names inside the folder (`IAttachmentStoragePort.ts`, `LocalDiskAttachmentStorageAdapter.server.ts`,
`AttachmentStoragePortToken.ts`, `SharedAttachmentStorageModule.server.ts`) are unchanged — they
already disambiguate "storage" at the identifier level, so the folder rename doesn't need to
cascade into them.

### Decision 3 — Port signature

```ts
export interface AttachmentDescriptor {
	readonly tenantId: string;
	readonly ownerType: string; // e.g. "hazardous-event" — matches legacy's existing directory arg
	readonly ownerId: string;
	readonly fileName: string; // sanitized basename only, never a path
}

export interface IAttachmentStoragePort {
	stage(
		tenantId: string,
		file: { name: string; content: Buffer },
	): Promise<{ tenantPath: string; name: string }>;
	promote(
		descriptor: AttachmentDescriptor,
		staged: { tenantPath: string; name: string },
	): Promise<{ fileKey: string }>;
	delete(descriptor: AttachmentDescriptor, fileKey: string): Promise<void>;
	retrieve(descriptor: AttachmentDescriptor, fileKey: string): Promise<Buffer>;
}
```

All four operations from the roadmap's own intent text (`stage temp → promote to permanent →
delete → retrieve`) are on the port and implemented by the adapter, for interface completeness
and DE/DR reuse. **Only `promote()` and `delete()` get a real caller in this change** —
`stage()`'s equivalent is still legacy's `/hazardous-event/file-pre-upload` route (unchanged, per
scope) and `retrieve()`'s equivalent is still legacy's `/hazardous-event/file-viewer` route
(unchanged). `stage()`/`retrieve()` are exercised only by the adapter's own unit tests until a
future CA-native upload route calls them. This is called out explicitly, not left implicit, per
this project's standing review discipline.

### Decision 4 — `tag` column type

`jsonb`, nullable. The widget's tokenfield output is confirmed (Context) to be an array of
`{id, name}`-shaped objects, not a bare string list — `text[]` would lose the `id`, and a child
table is unwarranted complexity for a field nothing queries by. Stored and round-tripped as
opaque JSON, matching how legacy's own `hazardous_event.attachments` JSONB column already treats
this same widget's full item shape.

### Decision 5 — Parser defensively nulls the non-matching field set

Because the widget's type toggle doesn't clear stale `file`/`url` values (Context),
`parseHazardousEventFormData.server.ts`'s attachment parsing must derive the persisted
`file_key`/`file_name`/`file_type`/`url` fields **from `file_option` first**, discarding
whichever side doesn't match, rather than trusting both halves of the raw payload. This is what
lets the `check()` constraint (schema) hold on every real submission, not just a hand-constructed
one.

### Decision 6 — Discard the client-supplied `id`; mint fresh server-side UUIDs

The widget's new-item `id` (`Date.now().toString()`) cannot satisfy the table's `uuid` primary
key type. `DrizzleHazardousEventRepository.server.ts` already deletes-and-reinserts the full
attachment collection on every update (`insertChildCollections`/the delete calls preceding it) —
there is no cross-save identity to preserve today regardless of id format. The repository mints
`crypto.randomUUID()` per row at insert time; the parser's `HazardousEventAttachmentProps` keeps
an `id` field for in-memory/domain-object identity within a single request only, never the
widget's raw value.

### Decision 7 — Promote/delete run inside the same DB transaction, before commit

**Confirmed with the human.** `promote()`/`delete()` execute inside the same
`transactionRunner.run()` callback as the row insert/delete, before that callback returns — not
after the transaction commits. Rationale: a later failure in the same transaction then rolls back
the DB write and leaves at worst an orphaned file on disk (harmless — no DB row points at it).
The alternative (side effect after commit, mirroring `ProcessWorkflowAction`'s
`INotificationPort.notify()` call, whose failures are tolerated/logged per ADR-004) fits a
notification, where a missed send has no user-visible broken state, but not a file move: if
`promote()` ran after commit and failed, the already-committed row's `file_key` would point at a
file that was never moved, a user-visible broken attachment on the next page load. The stricter,
pre-commit ordering is the one adopted here; `ProcessWorkflowAction`'s precedent is noted but not
followed for this specific side effect, for the reason above.

### Decision 8 — `DeleteHazardousEventUseCase` gets `delete()` wiring

Not in the roadmap's "at minimum" file list, added here because the port's own `delete()`
operation otherwise has zero production callers, and hard-deleting a `HazardousEvent` today
cascades the DB rows but leaves every promoted file permanently orphaned on disk (confirmed —
`DeleteHazardousEventUseCase` calls no storage port anywhere). Scoped narrowly: delete the
on-disk file for each File-type attachment being removed, inside the same transaction's
dependent-check flow, before the DB delete commits.

### Decision 9 — Detail page attachments rendering: a proper table replacing the bare `<ul>`

**Confirmed gap** (live, found during this change's own implementation):
`HazardousEventDetailPage.tsx` (~L140-150) renders `data.attachments` as
`<ul>{attachments.map(a => <li>{a.title}</li>)}</ul>` — title only. `data.attachments` already
carries the full `HazardousEventAttachmentProps` shape end to end (confirmed by reading
`HazardousEventDto.ts`'s `mapHazardousEventFields()` and `HazardousEventDetailDto.ts` — neither
omits or overrides `attachments`), so this is a presentation-only gap: no DTO, mapper, use-case,
port, or query change is needed.

**Reference-source type** (per this project's presentation-change checklist): (a) real, existing
code of the same semantics — `app/frontend/attachmentsView.tsx`, legacy's own read-only
attachments table, read directly line by line, not assumed or screenshotted.

**Ground-truth checklist extracted from `attachmentsView.tsx`**:

- Column set and order: exactly three — Title, Tags, File/URL. No Actions column (this is a
  read-only detail view, not the edit widget).
- Tags cell: `tag.map(t => t.name).join(", ")`. Legacy shows the literal string `"N/A"` when
  `tag` is falsy/empty. **Deliberate deviation**: render `"—"` instead, matching this same page's
  own existing convention for a nullable reference field (`hazardTypeName`/`hazardClusterName`/
  `currentSpatialObservation.note` all use `?? "—"` here already) — legacy precedent is a
  starting point, not binding, per this project's standing rule, and there is no reason to
  introduce a second, inconsistent "empty" string on the same page.
- File/URL cell: `type === "File"` renders a working link to the file; `type === "Link"` renders
  a working link to `attachment.url`. Legacy's `fileOrUrl` has a third `"N/A"` fallback branch
  for neither case, which is dead code under the new schema — `type` is `NOT NULL` and the
  table's own check constraint (`hazardous-event-attachment-schema`) guarantees every row is
  exactly one of `"File"`/`"Link"`, so that fallback is not carried forward.
- Row order: natural array order, no sort — unchanged from the `<ul>` it replaces.
- Empty state: untouched per explicit scope — `t("detail.attachments_none")` keeps rendering
  exactly as today when `data.attachments.length === 0`.
- **Title cell fallback (added post-review, Gate 10 finding)**: `title` is domain-legal `""`
  (no length check in `validateAttachments()`), and this column is the row's `isRowHeader` --
  an unguarded blank would announce as nothing to assistive tech. Legacy falls back to `"N/A"`;
  this page uses its own existing `orDash()` convention (`"-"`) instead, since `title` is
  `string` (an empty-string field, like `nationalSpecification`/`description` elsewhere on this
  page), not `string | null` (Tags' `"—"` convention is for the latter).
- **`focusChild` on the File/URL cell (added post-review, Gate 9 finding)**: confirmed live that
  without it, ArrowRight grid navigation lands on the `<td>` itself, never the `<a>` inside --
  same `TableCell.tsx` precedent as the list page's own Actions column.

**File-viewer URL construction — verified against both the writer and the reader, not just
legacy's own link code**:

- `attachmentsView.tsx`'s link: `${file_viewer_url}?name=${id}/${fileName}`, where `fileName`
  there is `attachment.file.name.split("/").pop()` (a basename).
- `handleFileRequest()` (`app/components/ContentRepeater/FileViewer.ts`, the handler behind the
  unchanged `/hazardous-event/file-viewer` route) reads `name` as one opaque value and resolves
  it as `path.resolve(allowedDir, normalizedFileName)`, where `allowedDir` already equals
  `uploads/tenant-{id}/hazardous-event`. So `name` must be `{eventId}/{the file's own on-disk
basename}` — confirming the adapter's documented layout (Decision 1/3).
- In the new CA shape (`HazardousEventAttachmentProps`), `fileKey` **is** that on-disk basename
  (confirmed: `LocalDiskAttachmentStorageAdapter.server.ts`'s `promote()` sets
  `fileKey: stagedBase`, the raw `{uuid}__{basename}`-prefixed disk name), while `fileName` is
  the human-readable display name (`deriveDisplayName(stagedBase)`, the uuid prefix stripped
  back off). **The two are not interchangeable**: the link's `href` must build `name` from
  `data.id`/`attachment.fileKey`; the link's visible text must use `attachment.fileName`.
  Swapping them 404s the download, since the display name alone does not exist on disk.
- Build the href as
  ``ctx.url(`/hazardous-event/file-viewer?name=${encodeURIComponent(data.id)}/${encodeURIComponent(attachment.fileKey)}`)``
  — `encodeURIComponent` per segment, matching how every other internal link on this page
  already goes through `ctx.url()`. Legacy doesn't encode, but both segments are already a
  UUID and a sanitized basename in practice, so this is a no-op safety margin, not a behavior
  change.
- No `download=true` query param — legacy's own link omits it (opens inline/new-tab, not a
  forced download); match legacy's existing behavior exactly rather than inventing a new one.

**Layout / navigation affordances**: this is a field _inside_ the existing `dts-form` detail
layout, not a new page — there is no new `MainContainer`/breadcrumb/nav decision to make. The
attachments table replaces the `<ul>` in place, inside the same shell the rest of
`HazardousEventDetailPage` already uses.

**Component choice**: `Table`/`TableColumn`/`TableRow`/`TableCell`
(`app/design-system/components/`) — React Aria-based, per this change's own established
Decision 7 (presentation layer) precedent that every CA-refactored surface in this module uses
these, not a raw `<table>` (legacy's own inline-styled markup is not copied). The two links
inside cells (file download, external URL) are plain native `<a>` elements, not the
design-system `Link` component: `Link.tsx`'s own contract ("already lang-prefixed by the
caller... carries no app-routing knowledge") delegates to React Router's `RouterLink` for
in-app SPA transitions, and neither target here is one — a file-viewer response is a binary
file (not a rendered route), and `attachment.url` is an arbitrary external address. `ctx.url()`
is still used to build the file-viewer link's lang-prefixed path, matching every other internal
reference on this page; it's just not wrapped in `Link`.

**Implementation note (added during the Refactor loop, SOLID/SRP finding)**: the File/URL
href+label resolution above was extracted into a sibling pure helper,
`attachmentLink.ts`/`.test.ts`, taking `ctx.url` as an injected parameter rather than reading
`useViewContext()` directly — the same pattern this file's own `hazardLabel.ts`/
`workflowStatusDisplay.ts` already use. Not a new file this design anticipated up front; added
to keep the render body declarative and unit-testable, per `app/domains/hazardous-events/
presentation/web/HazardousEventDetailPage.tsx`'s own established precedent.

**Locale additions**: new keys under `detail.attachments_table.columns` (`title`/`tags`/
`file_url`) in `locales/en/hazardous-events.json`, siblings of the existing `detail.fields`/
`detail.spatial_observation` nested objects — not a new, disconnected naming scheme.
`detail.fields.attachments` (the section heading, "Attachments:") and `detail.attachments_none`
(the empty state) are unchanged.

**Open item flagged for the human — not silently resolved**: `attachment.url` is rendered as a
raw `href` with no scheme allowlist; a stored `javascript:`-scheme value would be an XSS vector.
This is carried forward **unchanged** from legacy's own identical `attachmentsView.tsx` code
(same raw `href={attachment.url}`), not a regression this fix introduces, and is out of this
fix's scope (presentation parity only — no new input-validation layer is being added here).
Flagged per this project's standing risk-disclosure convention; left for the human to decide
fix-now vs. a deferred-register entry vs. accept-as-legacy-equivalent. **Resolved**: accept as
legacy-equivalent risk (human decision, 2026-11-07) — not fixed, not deferred-register logged.

**Decision 9 Addendum — row height parity gap, found live post-implementation (2026-11-11)**:
the human compared the shipped table against legacy's and found each row visibly taller. Root
cause, confirmed via `getComputedStyle`: `TableCell`/`TableColumn` hardcode
`height: var(--spacing-dts-row-height)` (3.86rem/54px) inline — the generic data-grid row height
these components share with the HE list page — which an external CSS override cannot beat (an
inline style always wins over any class selector, regardless of specificity or source order; a
`.dts-table--compact` class rule was tried first and confirmed ineffective for exactly this
reason). Fix: both components gained an opt-in `compact?: boolean` prop (defaulting to the
existing fixed-height behavior, so the list/picker pages are untouched) that swaps in
`height: "auto"`, sizing the row to its content — matching legacy's own naturally content-sized
rows (37.8px, confirmed identical to the fixed table's own measurement). This page's own
`<TableColumn>`/`<TableCell>` usages now all pass `compact`. Verified live: row heights now
37.35-37.75px here vs. legacy's 37.8px; the HE list page's own rows (not passing `compact`)
remain unchanged at 54px.

## Risks / Trade-offs

- [Risk] Promote/delete are filesystem side effects outside Postgres's transaction boundary — a
  mid-transaction rollback after a successful `promote()` leaves an orphaned file with no DB row
  pointing at it (harmless disk leak, not a dangling user-visible reference). → Mitigation:
  Decision 7 deliberately accepts this small disk-leak risk as the lesser failure mode, in
  exchange for never leaving a committed row whose `file_key` points at a file that was never
  moved.
- [Risk] Concurrent saves of the same event could promote/delete files into the same per-event
  directory at the same time. → Mitigation: the new adapter's `promote()` only ever adds the one
  file it was asked to promote and never deletes anything it wasn't explicitly told to delete
  (unlike legacy's directory-wide cleanup) — two concurrent promotes of different files succeed
  independently; this must be a concurrent-callers scenario in the shared-attachments-port
  spec per this project's standing testing rule.
- [Risk] A `check()` constraint rejecting a real widget submission at insert time is a worse
  failure mode than today's silent drop (it surfaces as a 500, not nothing) if Decision 5's
  defensive nulling has a gap. → Mitigation: the PGlite integration tests use a real
  `ContentRepeater`-shaped fixture including a type-switched stale-field case, not just clean
  File/Link fixtures.
- [Risk] Decision 7's own reasoning for running `promote()`/`delete()` pre-commit doesn't
  transfer symmetrically to `delete()`: a rolled-back `promote()` leaves a harmless orphan (no
  row ever pointed at the unmoved file), but a rolled-back `delete()` is unsafe (the file is
  already gone, and the DB rollback restores a row that now points at nothing) — found in Gate 8
  code review, confirmed by the human. → Mitigation: `deleteAttachmentFiles()` logs and swallows
  a per-file `delete()` failure instead of letting it propagate, so it can never trigger a
  rollback; the residual failure mode becomes the same accepted orphan case as `promote()`'s own
  risk above, not a dangling reference. `delete()` still runs inside the transaction, same as
  `promote()` — only this specific error-propagation behavior changed.
- [Risk] `promote()`'s correctness depends on legacy's unchanged `PreUploadFile.tsx` continuing
  to name staged files `{uuid}__{basename}` — found in Gate 10 review. → Mitigation: the E2E spec
  (`tests/e2e/hazardous-events/he-preview-attachments.spec.ts`) uploads through the real browser
  and the real `/hazardous-event/file-pre-upload` route, not via the adapter's own `stage()`
  directly, so a future change to that naming convention would fail this suite, not just surface
  silently in production.
- [Risk] `fileType` for a File-type attachment is unverified, client-asserted `content_type` —
  currently inert, since legacy's unchanged file-viewer route sets its response `Content-Type`
  from a fixed extension→MIME map, never from this column. If a future CA-native file-viewer
  route (Decision 3's own "first real caller" possibility) ever uses the stored `fileType` to set
  a response header, this becomes a live MIME-sniffing concern worth revisiting then.
- [Risk] Decision 9's detail-page Link-type cell renders `attachment.url` as a raw, unvalidated
  `href` — a stored `javascript:`-scheme value is a stored-XSS vector. → Carried forward
  **unchanged** from legacy's own identical `attachmentsView.tsx` code (same raw
  `href={attachment.url}`); not a regression this fix introduces, and out of scope for this
  presentation-parity fix (no new input-validation layer is being added here). Flagged for a
  human fix-now/defer/accept decision, not silently resolved either way.

## Migration Plan

1. `yarn dbsync`-authored migration (hand-written SQL, `--> statement-breakpoint` between every
   statement per this project's standing migration rule):
   - Add `url` (nullable `text`), `tag` (nullable `jsonb`).
   - Drop `NOT NULL` on `file_key`/`file_name`/`file_type`/`file_size`.
   - Add `type` as nullable first.
   - `UPDATE hazardous_event_attachment SET type = 'File' WHERE type IS NULL` — every existing
     row was inserted by the pre-`6i` code path (which required all four `file_*` columns), so
     `'File'` is correct for all of them; this is the table's own existing rows, not the Phase M
     legacy-JSONB backfill, which remains untouched and out of scope.
   - Set `type NOT NULL`.
   - Add the `check()` constraint.
2. Update `tests/integration/db/testSchema/hazardousEventAttachmentTable.ts` to mirror (P1-42
   convention).
3. No rollback script beyond the standard `yarn dbsync` down-migration — no data beyond the
   backfilled `type` column is transformed, and the backfill is deterministic/idempotent.
