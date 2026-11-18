## Why

CA's `HazardousEventDetailPage.tsx` has two confirmed, related gaps against legacy's current
detail view: it has no audit-log section at all (`DEF-058`), and its flat field-list layout no
longer matches legacy's own rewritten `HazardousEventReviewStep.tsx` (`DEF-059`, dev commit
`3688c596`), which CA's prior `ca-he-route-adapter-read` effort captured before that legacy
rewrite landed. Legacy's new layout already builds the audit-log section in as one of its Card
sections, so fixing `DEF-058` against the current flat layout first would mean rebuilding that
section again the moment `DEF-059`'s layout rebuild replaces the whole page. Both are closed in
one pass, continuing on this same branch (`feature/ca-shared-audit-log`) per explicit user
direction — the Phase 6 PR is raised only once the audit log is fully visible on CA's page.

## What Changes

- Rebuild `HazardousEventDetailPage.tsx` from its current flat field-list into the Card-sectioned
  layout matching legacy's `HazardousEventReviewStep.tsx`: Basic information, Hazard details,
  Location (with a live read-only Leaflet spatial-footprint map), Attachments, Linked events, and
  a new Audit log history section — using this codebase's own `Table`/`TableColumn`/`TableCell`
  design-system components wherever they fit, not a literal port of legacy's PrimeReact `Card`
  markup.
- Add a new read-only audit-log query against the existing `audit_logs` table (written by the
  already-merged `ca-shared-audit-log` work on this same branch), keyed by `table_name` +
  `record_id`, scoped by `country_accounts_id`, ordered newest-first. No new write path, no
  schema change.
- Extend `HazardousEventDetailDto`/`GetHazardousEventById` to carry the resolved audit-log rows
  for the detail page to render.
- Keep CA's existing attachments data pipeline (its own shared-attachments-module DTO/mapper) —
  confirmed live that it is a separate data store from legacy's JSONB `attachments` column
  (parsed by legacy's `parseAttachments`), so legacy's attachment markup/shape is not something to
  port; only its Card-based visual grouping is.
- Render a "Linked events" card using both directions of CA's causal-chain resolution: the
  existing `cause` (parent) field, and a new `effects` (children) resolution added by this change
  — matching legacy's real "Caused by"/"Causing" behavior for both directions, per explicit user
  decision (2026-11-12), superseding this proposal's original plan to defer "Causing" as an open
  item.
- Add `ICausalChainRepository.findEffectEdges(causeId, tx?)` — a new, single-hop (direct
  children only) read method on the existing causal-chain port, the inverse of the existing
  `findCauseEdge`. Thread it through `GetHazardousEventById` the same way `cause` is threaded
  today, resolving each effect event (tolerating an unresolvable effect by omitting it, same
  degrade-gracefully precedent as `cause`).
- Correct `openspec/specs/hazardous-event-view/spec.md`'s stale Linked-events sub-label wording
  ("Triggering (caused by)"/"Triggered (causing)") to the live-confirmed real labels ("Caused
  by"/"Causing"), as a small additive housekeeping fix folded into this same change per explicit
  user decision (2026-11-12) — not a separate change.
- Remove the detail page's Edit link and "Add hazardous event caused by this event" link, and stop
  the detail loader capturing/returning `role` — a fresh manual-review round (2026-11-17) found
  legacy's real current page has neither affordance (design.md Decision 11). Edit remains
  reachable from the list page's own row actions; also corrects the main spec
  `hazardous-event-route-adapter`, which previously mandated both links.
- A third manual-review round (2026-11-18) closes three further, independent gaps (design.md
  Decision 13): add an optional header icon to the design-system `Card` and wire legacy's own
  six icons (one per section); replace the Basic information/Hazard details field-grid wrapper's
  older, tighter `mg-grid mg-grid__col-2` spacing with legacy's own literal
  `grid grid-cols-1 gap-6 md:grid-cols-2`; and correct the Hazard details Card's Type/Cluster/
  Specific-hazard field labels to legacy's current wording ("Hazard type"/"Hazard cluster"/
  "Specific hazard"), replacing the stale `detail.classification.*` namespace those three fields
  used.
- A fourth correction round (2026-11-18), triggered by a real live-Chrome screenshot side-by-side
  comparison that caught a defect in the third round's own work (design.md Decision 14): move the
  Specific-hazard field back into Hazard details' first field grid (legacy's real grid holds three
  fields, Type/Cluster/Specific hazard, not the two-field pair the third round built); add
  per-Card, legacy-matching vertical spacing between Hazard details' and Location's own multiple
  content blocks (a local fix per Card, not a shared `Card.tsx` change — legacy itself uses
  different spacing values for different Cards); and three further parity gaps found during this
  round's deeper legacy read: render Attachments' tags as styled pills instead of comma-joined
  text; add a file-type icon and, where known, a file size to the Attachments File/URL column;
  and rebuild the Linked events Card's cause/effect entries as legacy's own bordered "linked
  record" card with a title/subtitle (surfacing the resolved taxonomy code and a short id, via two
  new DTO fields on `cause`/`effects` resolved from data already fetched in memory — no new
  query) and legacy's own internal Caused-by/Causing grouping, instead of a flat, unspaced list of
  bare links.

- A fifth correction round (6e, 2026-11-18), a large bundled round the orchestrator independently
  investigated and verified against live source/DOM measurements before handing off (design.md
  Decision 15): fix the Card header icon's vertical misalignment with its title (legacy never uses
  the shared `dts-heading-5` class CA's `Card` relies on) by widening `Card` with a `titleSize`
  prop matching legacy's own two title-size groups, which also restores the header-to-content gap
  that removing `dts-heading-5` would otherwise zero out; give `Card` a real visible shadow
  (legacy's own `shadow-none` Tailwind class is vestigial against PrimeReact's theme CSS; CA's own
  `shadow-none` is not); move the CA-only "Record status" field to the end of the Basic information
  field sequence so the remaining 7 fields regain legacy's exact grid alignment; fix the Linked
  events "Caused by"/"Causing" labels to legacy's exact markup (no colon, specific classes, not a
  generic `<strong>`); add legacy's link color/weight/hover styling to attachment link anchors and
  a minimal scheme allowlist on the one user-entered attachment URL (defense in depth); switch the
  Attachments table's cell padding from the compact design-system token to legacy's own `px-3 py-2`
  via a new, shared `TableCell`/`TableColumn` padding variant; and replace the Audit log history
  Card's use of the cross-domain `~/components/AuditLogHistory` with CA's own table built on that
  same shared padding variant, porting `AuditLogHistory`'s own Create/Update/Delete-object action
  translation into this page's own `useTranslation`/`t()` mechanism so French translation of those
  three action strings is not silently lost.

Not in scope: `DEF-057` (a real spatial-footprint picker/editor widget) — the map here is a
read-only view of an existing observation, matching what `ReviewLocationMap` does in legacy.

## Capabilities

### New Capabilities

- `hazardous-event-detail-page`: the rebuilt CA detail page's Card-sectioned structure, content,
  and the new audit-log section — no existing capability spec currently owns
  `HazardousEventDetailPage.tsx`'s visual/content structure (confirmed by search:
  `hazardous-event-view` specifies legacy's own route/component, not CA's).

### Modified Capabilities

- `shared-audit-log-port`: adds a read method (`findByRecord`, tenant-scoped) alongside the
  existing write-only `record()` — same port module, new capability on it, not a change to
  `record()`'s existing documented behavior.
- `causal-chain-repository-port`: adds `findEffectEdges(causeId, tx?)`, a single-hop read method
  resolving a node's direct children — the inverse of the existing `findCauseEdge`.
- `hazardous-event-view`: corrects Scenario 2's Linked-events sub-label wording to match the
  live-confirmed real labels ("Caused by"/"Causing"), while also wrapping the spec's existing 4
  scenarios in a named Requirement with 4-hash Scenario headers — the base file predates the
  Requirement/Scenario convention (zero Requirement headers, 3-hash Scenario headers), so this is
  a structural fix as well as a wording correction (see design.md).
- `hazardous-event-route-adapter`: reverses three Requirements added by a different,
  already-archived change (`2026-11-04-ca-he-route-adapter-write`) — the detail loader capturing
  and returning `role`, the Edit link, and the "Add hazardous event caused by this event" link — a
  fresh manual-review round (2026-11-17) found legacy's real current detail page has neither
  affordance (design.md Decision 11). Discovered during this round's verification, not anticipated
  by the original proposal; without this delta the main spec set would be self-contradictory at
  archive time.

## Impact

- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` — rebuilt into
  Card sections.
- `app/design-system/components/Card.tsx` — new design-system component (not anticipated by this
  proposal originally; no Card primitive existed in this codebase before this change — see
  design.md Decision 7 addendum).
- `app/domains/hazardous-events/presentation/web/HazardousEventLocationMap.tsx` and
  `leafletLoader.ts` — new Location-card map component and its typed, lazy-loading Leaflet
  wrapper (design.md Decision 5).
- `app/domains/hazardous-events/presentation/web/HazardousEventAttachmentsCard.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, `HazardousEventAuditLogCard.tsx` — not anticipated
  originally; extracted from the detail page during the Refactor loop per a SOLID-review SRP
  finding (each Card section now owns only the DTO slice/markup it needs).
- `app/domains/hazardous-events/presentation/web/orDash.ts` — not anticipated originally; the
  existing dash-for-empty helper, extracted so it's shared by the detail page and the new
  Attachments Card rather than duplicated.
- `app/domains/hazardous-events/presentation/web/hazardousEventStatusBadgeClassName.ts` — not
  anticipated originally; added during Gate 9 to render the Hazardous event status pill with
  legacy's own amber/emerald/blue colors.
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — add an
  `auditLog: AuditLogEntryDto[]` field.
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` — call the new
  audit-log read port and map rows onto the DTO.
- `app/domains/shared/audit-log/application/ports/IAuditLogPort.ts` — add `findByRecord` method
  signature.
- `app/domains/shared/audit-log/infrastructure/DrizzleAuditLogAdapter.server.ts` — implement
  `findByRecord` (new Drizzle query, no migration).
- `app/domains/shared/audit-log/infrastructure/SharedAuditLogModule.server.ts` — no change
  expected (same port/adapter pair), confirmed during implementation.
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — add
  `findEffectEdges` method signature.
- `app/domains/hazardous-events/infrastructure/DrizzleCausalChainRepository.server.ts` — implement
  `findEffectEdges` (single-hop query against `hazardous_event_causality`, no migration).
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` — extend the
  Fake conformance suite's `FakeCausalChainRepository` and add a `findEffectEdges` describe block,
  matching `findCauseEdge`'s existing coverage pattern.
- `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` — add a `findEffectEdges`
  describe block, matching `findCauseEdge`'s existing PGlite coverage pattern.
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — add an
  `effects: { id: string; displayName: string; causalityExplanation: string | null }[]` field,
  parallel to the existing `cause` field.
- `openspec/specs/hazardous-event-view/spec.md` — corrected and restructured via this change's
  own spec delta (never hand-edited directly), merged in at archive time.
- `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json` — new strings for the
  Card headings, Location/Linked-events empty states, and the Audit log history empty state
  (react-i18next, not the legacy `locales/app/en.json` system — this proposal originally named
  the wrong file; corrected here). The legacy `yarn i18n:extractor` doesn't apply to this file
  layout; the newer `yarn i18n:extract:new` does, but it rewrites every locale/namespace
  project-wide and this namespace is already missing entirely for 7 other locales (pre-existing,
  confirmed via `scripts/check-i18n-missing-keys.ts`) — out of this change's scope, same caution
  as never running bulk `yarn format`.
- `app/domains/hazardous-events/presentation/web/ReviewField.tsx` — not anticipated originally;
  added to close a Gate 9 follow-up finding (design.md Decision 10, Fix 3): a small, reusable
  stacked label/value field component for the Basic information and Hazard details Cards, matching
  legacy's own `renderReviewItem` pattern. The existing `Field` helper stays, now used only by the
  Location Card's two fields.
- `app/domains/hazardous-events/application/ports/ISpecificHazardTaxonomyRepository.ts` and
  `app/domains/hazardous-events/infrastructure/DrizzleSpecificHazardTaxonomyRepository.server.ts`
  — not anticipated originally; `SpecificHazardTaxonomyNames` widened with `specificHazardCode`
  (design.md Decision 10, Fix 1). Ripple: `HazardousEventListItemDto.test.ts` and
  `ListHazardousEvents.test.ts` fixture literals updated to add the now-required field; no
  production change to the List use case or its query result shape.
- `locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` — confirmed unchanged by
  this change's Gate 9 follow-up (design.md Decision 10, Fix 2): the existing
  `detail.linked_events.no_cause`/`no_effects` wording is finalized as-is, not edited.
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` — not anticipated
  originally; the Edit/add-cause JSX block, the `canAddCause`/`canEditNow` locals, and the `role`
  prop are removed (design.md Decision 11, fresh manual-review round, 2026-11-17).
- `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx` — not anticipated originally; the loader
  keeps calling `requireViewDataPermission` for its authorization side-effect but stops capturing
  and returning `role`; the route component stops passing a `role` prop (design.md Decision 11).
- `tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts` — not
  anticipated originally; removes the test asserting the loader returns `role`, replaced by a test
  asserting it does not (design.md Decision 11).
- `locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` — not anticipated
  originally; removes the now-unused `detail.add_cause` key from both files (design.md Decision
  11). `detail.edit` is kept — still used by `HazardousEventListPage.tsx`.
- `openspec/specs/hazardous-event-route-adapter/spec.md` — corrected via this change's own new
  spec delta (never hand-edited directly), merged in at archive time (design.md Decision 11).
- No DB migration. No change to `audit_logs`' schema or to the existing write paths
  (`CreateHazardousEvent`, `UpdateHazardousEvent`, `DeleteHazardousEvent`,
  `ProcessWorkflowAction`).
- Security/multi-tenancy: the new read query MUST filter by `countryAccountsId` in addition to
  `tableName`/`recordId` — the existing commented-out draft query in
  `app/db/queries/auditLogsRepository.ts` already shows this shape and is a useful precedent, not
  something to uncomment/reuse directly (it predates the Clean Architecture port).
- Test approach: PGlite integration tests (`yarn test:run2`) for the new read query/port and for
  `GetHazardousEventById`'s DTO mapping. Presentation-level tests for the rebuilt page. Gate 9
  (visual/UX parity) is mandatory given this is a presentation-layer rebuild.
- `app/design-system/components/Card.tsx` — not anticipated originally; widened with an optional
  `icon?: string` prop to render legacy's own header icons (design.md Decision 13, Fix 1).
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` — not anticipated
  originally; wires the new `icon` prop on its three direct `<Card>` usages, replaces
  `mg-grid mg-grid__col-2` with the literal `grid grid-cols-1 gap-6 md:grid-cols-2` at its three
  field-wrapper divs, removes two now-inaccurate code comments, and switches its three Hazard
  details `ReviewField` label calls from `detail.classification.*` to `detail.fields.*` (design.md
  Decision 13).
- `app/domains/hazardous-events/presentation/web/HazardousEventAttachmentsCard.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, `HazardousEventAuditLogCard.tsx` — not anticipated
  originally; each wires the new `icon` prop on its own `<Card>` usage (design.md Decision 13,
  Fix 1).
- `locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` — not anticipated
  originally; adds `detail.fields.hazard_type`/`hazard_cluster`/`specific_hazard` (reusing this
  file's own existing `form.fields.*` wording) and removes the now-unused
  `detail.classification.type`/`cluster`/`hazard` keys, keeping `detail.classification.heading`
  (still used by `HazardousEventHazardPicker.tsx`) (design.md Decision 13, Fix 3).
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` — not anticipated
  originally; moves the Specific-hazard field into Hazard details' first field grid, adds a local
  `space-y-6` wrapper around Hazard details' own content and a local `space-y-5` wrapper around
  Location's populated-branch content (design.md Decision 14). `app/design-system/components/
  Card.tsx` is explicitly NOT touched by this round — an earlier draft of a shared Card-level
  spacing fix was rejected once legacy's own per-Card spacing values were confirmed to differ.
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — not anticipated
  originally; widens both `cause` and `effects` with `specificHazardCode: string | null` and
  `description: string`, resolved from data already fetched in memory (no new query) (design.md
  Decision 14, Finding 6).
- `app/domains/hazardous-events/application/use-cases/GetHazardousEventById.ts` — not anticipated
  originally; populates the two new `cause`/`effects` fields above.
- `app/domains/hazardous-events/presentation/web/HazardousEventLinkedEventsCard.tsx` — not
  anticipated originally; rebuilt to render each resolved cause/effect as a bordered card with a
  composed title/subtitle (via a new `linkedEventSubtitle.ts` helper) and legacy's own internal
  Caused-by/Causing grouping, replacing the current flat, unspaced list of bare links (design.md
  Decision 14).
- `app/domains/hazardous-events/presentation/web/HazardousEventAttachmentsCard.tsx` — not
  anticipated originally; renders tags as styled pills instead of comma-joined text, and adds a
  file-type icon and, where known, a file size to the File/URL column, via two new local helpers
  (`attachmentFileIconClass.ts`, `formatAttachmentFileSize.ts`) — no DTO/data change, the
  underlying fields already exist on `HazardousEventAttachmentProps` (design.md Decision 14,
  Findings 4-5).
- `locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` — not anticipated
  originally; adds `detail.linked_events.hip_label`/`.uuid_label`/`.unresolved_event` (design.md
  Decision 14, Finding 6).
- Test quality: `test-quality-auditor` run against this round's new/changed implementation logic
  (the two attachment-formatting helpers, the new `linkedEventSubtitle` helper, and the
  `GetHazardousEventById` mapping change) per this round's own tasks.md task.
- `app/design-system/components/Card.tsx` — not anticipated originally; widened with a
  `titleSize?: "sm" | "lg"` prop (default `"lg"`) replacing the shared `dts-heading-5` class with
  legacy's own two literal title-size/weight classes, and restoring the header-to-content gap that
  removing `dts-heading-5` would otherwise zero out; `shadow-none` replaced with an arbitrary-value
  Tailwind shadow reproducing PrimeReact's real `.p-card` box-shadow (design.md Decision 15, Fixes
  1-2).
- `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.tsx` — not anticipated
  originally; wires `titleSize` at its three direct `<Card>` usages, and moves the "Record status"
  field to the end of the Basic information field sequence (design.md Decision 15, Fixes 1/3).
- `app/domains/hazardous-events/presentation/web/HazardousEventAttachmentsCard.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, `HazardousEventAuditLogCard.tsx` — not anticipated
  originally; each wires the new `titleSize` prop on its own `<Card>` usage (design.md Decision 15,
  Fix 1).
- `app/domains/hazardous-events/presentation/web/HazardousEventLinkedEventsCard.tsx` — not
  anticipated originally; the "Caused by"/"Causing" group labels render with legacy's exact
  no-colon markup instead of a generic bold-with-colon `<strong>` (design.md Decision 15, Fix 4).
- `app/domains/hazardous-events/presentation/web/HazardousEventAttachmentsCard.tsx` — not
  anticipated originally; both attachment-link anchor variants gain legacy's link color/weight/
  hover classes (design.md Decision 15, Fix 5), and its File/Link cells render through the new
  `TableCell`/`TableColumn` `padding="cozy"` variant instead of the `compact` token padding
  (design.md Decision 15, Fix 7).
- `app/domains/hazardous-events/presentation/web/attachmentLink.ts` — not anticipated originally;
  the Link-branch `href` is now scheme-allowlisted (`http:`/`https:` only; any other scheme or a
  malformed/relative URL resolves to `undefined`, omitting the `href` attribute rather than
  navigating), a minimal defense-in-depth fix for a user-entered URL already flagged LOW by Gate 10
  (design.md Decision 15, Fix 6). The File branch's `href` is unaffected — it is always an
  app-built, never user-entered, path.
- `app/design-system/components/TableCell.tsx`, `TableColumn.tsx` — not anticipated originally;
  both widened with a `padding?: "token" | "cozy"` prop (default `"token"`, byte-identical to
  today for every existing caller). `"cozy"` renders legacy's own `px-3 py-2` padding (expressed as
  an inline style, matching this app's own `.dts-table th`/`td` cascade precedent, since a
  `className` cannot out-specificity that existing unlayered rule) with `height: "auto"`, shared by
  both the Attachments and the new Audit log tables rather than each styling its own cells
  separately (design.md Decision 15, Fix 7).
- `app/domains/hazardous-events/presentation/web/HazardousEventAuditLogCard.tsx` — not anticipated
  originally; stops importing `~/components/AuditLogHistory` and instead renders its own table via
  the shared `Table`/`TableColumn`/`TableRow`/`TableCell` components (the same `padding="cozy"`
  convention as Attachments), with the same 5 columns and the same empty-state behavior as before.
  `app/components/AuditLogHistory.tsx` itself is untouched — still available for DE/DR's own future
  use (design.md Decision 15, Fix 8).
- `app/domains/hazardous-events/presentation/web/translateAuditLogAction.ts` — new; a small,
  presentation-layer helper that ports `AuditLogHistory`'s own `translateAuditLogAction`
  Create/Update/Delete-with-object translation logic onto this page's own `useTranslation`/`t()`
  mechanism, so this behavior is not silently lost once `AuditLogHistory` stops being used on this
  page (design.md Decision 15, Fix 8).
- `app/domains/hazardous-events/application/humanizeAuditAction.ts` — not anticipated originally;
  doc comment corrected — it no longer relies on `AuditLogHistory`'s own translation switch
  downstream; that logic now lives in the new `translateAuditLogAction.ts` above (design.md
  Decision 15, Fix 8).
- `app/domains/hazardous-events/application/dto/HazardousEventDetailDto.ts` — not anticipated
  originally; the `auditLog` field's doc comment corrected for the same reason (no behavior/type
  change).
- `locales/en/hazardous-events.json`/`locales/fr/hazardous-events.json` — not anticipated
  originally; adds `detail.audit_log.columns.*` (5 table-header strings) and
  `detail.audit_log.actions.*`/`.object_hazardous_event` (the ported Create/Update/Delete
  translation), reusing the legacy translation system's own existing
  `audit_log.action_taken`/`.by`/`.organisation`/`.date`/`.time`/`.action.create_with_object`/
  `.update_with_object`/`.delete_with_object` and `hazardous_event` values verbatim, in both `en`
  and `fr` (design.md Decision 15, Fix 8).
- `openspec/specs/hazardous-event-detail-page/spec.md` — corrected and extended via this change's
  own spec delta (never hand-edited directly), merged in at archive time (design.md Decision 15).
