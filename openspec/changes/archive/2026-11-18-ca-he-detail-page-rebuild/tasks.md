## 1. Causal-chain read port (`ICausalChainRepository.findEffectEdges`)

- [x] 1.1 Write a failing test in `ICausalChainRepository.test.ts`'s existing Fake-conformance
  suite: extend `FakeCausalChainRepository` with a real `findEffectEdges` implementation (filter
  stored edges by `causeId`), then add a `describe("findEffectEdges")` block covering: empty
  array for a node with no outgoing edges; one resolved effect; multiple resolved effects, each
  with its own `causalityExplanation`; only direct (one-hop) effects returned, transitively
  reachable-but-not-direct nodes excluded; a node that is only ever an effect (never a cause)
  resolves empty (design.md Decision 8, spec: `causal-chain-repository-port`). Verify with
  `yarn vitest run app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts`
  (failing, since `findEffectEdges` does not exist yet on the interface).
- [x] 1.2 Add `findEffectEdges(causeId: string, tx?: Tx): Promise<readonly { effectId: string;
  causalityExplanation: string | null }[]>` to `ICausalChainRepository.ts` (design.md Decision 8
  signature) and implement it in `DrizzleCausalChainRepository.server.ts` (single-hop query
  against `hazardous_event_causality` filtered by `cause_hazardous_event_id = causeId`). Verify
  the 1.1 test passes.
- [x] 1.3 Write a failing PGlite integration test in the existing
  `tests/integration/db/queries/DrizzleCausalChainRepository.test.ts`, mirroring its existing
  `findCauseEdge` describe block's structure, for `findEffectEdges` (same scenarios as 1.1, plus:
  called under a caller-supplied `tx`, the result reflects that transaction's own uncommitted
  writes). Verify with
  `yarn vitest run tests/integration/db/queries/DrizzleCausalChainRepository.test.ts` (failing,
  then green after 1.2's implementation).

## 2. Audit-log read port (`IAuditLogPort.findByRecord`)

- [x] 2.1 Write a failing PGlite integration test for
  `DrizzleAuditLogAdapter.findByRecord(tableName, recordId, countryAccountsId)` covering: rows for
  the given tenant are returned newest-first; rows under a different `countryAccountsId` are
  excluded even with matching `tableName`/`recordId`; no matching rows resolves to `[]`; a row
  whose `userId` no longer resolves to a `userTable` row still resolves without throwing. Verify
  with `yarn vitest run tests/integration/db/<path-to-new-test>.test.ts` (failing).
- [x] 2.2 Add `findByRecord` to `IAuditLogPort` (design.md Decision 2 signature:
  `(tableName: string, recordId: string, countryAccountsId: string) => Promise<{ id: string;
  action: string; actorName: string; timestamp: Date }[]>`) and implement it in
  `DrizzleAuditLogAdapter.server.ts` (left join to `userTable` for `actorName`, filter by all
  three columns, order by `timestamp desc`). Verify the 2.1 test now passes:
  `yarn vitest run tests/integration/db/<path-to-new-test>.test.ts` (green).
- [x] 2.3 Confirm `SharedAuditLogModule.server.ts` needs no wiring change (same port/adapter pair)
  — if it does, update it and note why in a one-line code comment.

## 3. `GetHazardousEventById` — cause/effects resolution, audit-log mapping, action-string
   normalization

- [x] 3.1 Write a failing test for `GetHazardousEventById` asserting it calls the new
  `findEffectEdges(event.id)`, resolves each returned `effectId` via
  `hazardousEventRepository.findById`, and maps the resolved set onto a new
  `HazardousEventDetailDto.effects` field — mirroring the existing `cause` resolution's shape
  (`{ id, displayName, causalityExplanation }[]`) and its exact `NotFoundError`-degrades,
  other-errors-rethrow pattern per resolved effect (design.md Decision 8). Include a case with
  multiple effects where one effect's id does not resolve (simulated dangling reference): that one
  effect is omitted, the rest and the rest of the DTO still resolve. Verify with
  `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
  (failing).
- [x] 3.2 Add `effects: { id: string; displayName: string; causalityExplanation: string | null
  }[]` to `HazardousEventDetailDto` and wire `GetHazardousEventById` to populate it, extending the
  existing batched `findNamesByIds` call to include every resolved effect's `specificHazardId`
  (not one call per effect). Verify the 3.1 test passes (green).
- [x] 3.3 Write a failing unit/PGlite test for `GetHazardousEventById` asserting it calls
  `findByRecord` with this event's `table_name`/`id`/`countryAccountsId` and maps the result onto
  `HazardousEventDetailDto.auditLog`, newest-first, unchanged. Verify with
  `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
  (failing).
- [x] 3.4 Add `auditLog: { id: string; action: string; actorName: string; timestamp: Date }[]` to
  `HazardousEventDetailDto` and wire `GetHazardousEventById` to call `findByRecord` and populate
  it. Verify the 3.3 test passes (green).
- [x] 3.5 Write a failing test for the action-string humanizer (design.md Decision 4): given
  `"submit-draft"`, `"direct-publish"`, `"validate"`, `"return"` etc., it returns a humanized form
  (e.g. `"Submit draft"`); given `"Create hazardous event"` / `"Update hazardous event"` / a
  `"Delete <object>"`-shaped string, it returns the string unchanged (so `AuditLogHistory`'s own
  translation still applies). Verify with
  `yarn vitest run app/domains/hazardous-events/application/<path>/actionLabel.test.ts` (failing).
- [x] 3.6 Implement the humanizer and apply it when mapping `action` onto
  `HazardousEventDetailDto.auditLog` (read-side only — do not touch
  `CreateHazardousEvent.ts`/`UpdateHazardousEvent.ts`/`DeleteHazardousEvent.ts`/
  `ProcessWorkflowAction.ts`'s write-side `action` values). Verify the 3.5 test passes (green).

## 4. Detail page rebuild — Basic information, Hazard details, Location

- [x] 4.1 Write a failing presentation test asserting `HazardousEventDetailPage` renders a "Basic
  information" Card containing Record originator, Hazardous event status, Record status,
  Magnitude, Data source, UUID, Created at, Updated at (all fields currently on the flat page,
  none dropped — Record status via the existing `workflowStatusDisplay` helper, no new helper
  needed; design.md's ground-truth correction note). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing). (Path corrected from tasks.md's original `.test.ts` to the real `.test.tsx` —
  documentation-inaccuracy fix in passing.)
- [x] 4.2 Rebuild the Basic information section as a Card per design.md's ground truth (section
  order item 1). Verify the 4.1 test passes. New `app/design-system/components/Card.tsx` added —
  no design-system Card existed before this task; see design.md Decision 7 addendum.
- [x] 4.3 Write a failing test asserting a "Hazard details" Card renders Hazard type, Hazard
  cluster, Specific hazard, Start date, End date, National specification, Description, Chains
  explanation. Resolved during implementation: kept this page's own existing `orDash` ("-" for
  empty) convention for these three fields rather than legacy's own omit-when-empty behavior —
  spec `hazardous-event-detail-page`'s "SHALL NOT drop any field currently shown on the flat page"
  requirement decides this, not a guess (see design.md Decision 7 addendum). Verified failing,
  then implemented, then green.
- [x] 4.4 Write a failing test asserting a "Location" Card renders a map when
  `currentSpatialObservation` is non-null and an empty-state message with no map container when
  null (spec: `hazardous-event-detail-page` — Location section requirement). Verify failing.
- [x] 4.5 Implement the Location Card, porting `ReviewLocationMap`'s lazy-load-Leaflet approach
  (design.md Decision 5) adapted to render the single `currentSpatialObservation` geometry CA's
  DTO carries today (not legacy's multi-layer `spatialFootprint[]` history). Verify the 4.4 test
  passes. New `HazardousEventLocationMap.tsx` + `leafletLoader.ts` (typed Leaflet subset, no
  `as any`, no `@types/leaflet` package).

## 5. Detail page rebuild — Attachments, Linked events, Audit log history

- [x] 5.1 Move the existing Attachments table (already using `Table`/`TableColumn`/`TableCell`,
  unchanged data source) into its own "Attachments" Card with no change to its data mapping logic.
  Verify existing attachment tests/presentation tests still pass:
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`.
- [x] 5.2 Write a failing test asserting a "Linked events" Card renders: a "Caused by" entry
  linking to `cause`'s detail page when `cause` is non-null, an empty-state message when null; a
  "Causing" entry rendering one linked-event entry per item in `effects` when non-empty, linking
  to each effect's own detail page, and an empty-state message when `effects` is empty (spec:
  `hazardous-event-detail-page` — Linked events requirement, design.md Decisions 6/8). Verify
  failing.
- [x] 5.3 Implement the Linked events Card, rendering both `cause` and `effects` via the
  design-system `Link` component to `/he-preview/:id`. Verify the 5.2 test passes.
- [x] 5.4 Write a failing test asserting an "Audit log history" Card renders a 5-column table
  (Action taken, By, Organisation, Date, Time) from `data.auditLog`, newest-first, and renders an
  empty-state message (no table) when `data.auditLog` is empty. Verify failing.
- [x] 5.5 Implement the Audit log history Card (reuse `~/components/AuditLogHistory`, mapping
  `actorName` → its `by` prop and passing `organization: null` per design.md Decision 3). Verify
  the 5.4 test passes.
- [x] 5.6 Add the new locale strings this rebuild introduces (Card headers not already covered by
  existing i18n keys) to `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`
  directly (tasks.md originally named `locales/app/en.json`, the legacy locale file — corrected in
  passing; this is react-i18next, not the legacy translation system, so the legacy `yarn
  i18n:extractor` does not apply. The newer `yarn i18n:extract:new` (`i18next-cli extract`) does
  target this file layout, but it scans `app/**/*.{ts,tsx}` and rewrites every locale/namespace
  project-wide — run against a pre-existing, project-wide gap (`ar`/`zh`/`ru`/`es`/`sr`/`sq`/`tg`
  are already missing this entire namespace, confirmed via `tsx scripts/check-i18n-missing-keys.ts`
  before this change touched anything), so running it here would be an unscoped, repo-wide edit
  for a gap this change didn't create — out of scope, same caution as never running bulk `yarn
  format`. `en`/`fr` are the only locales this project fully supports for this namespace today;
  both are hand-updated directly above).

## 6a. Edit and Add-cause link removal (fresh manual-review correction round, 2026-11-17)

Not a Gate 9 follow-up fix (that's section 6, below) — this is a separate correction from a fresh,
careful manual review the user did directly against the real current legacy page, which found
section 6's own earlier Gate 9 visual-parity pass was not rigorous enough: it never re-checked
whether legacy's rebuilt detail page has an Edit/add-cause affordance at all (design.md Decision
11). Numbered "6a" rather than renumbering sections 6/7/8/9, consistent with this file's own
established practice of avoiding renumbering risk across a large, narrative-heavy document
(design.md Decision 9's own "don't renumber the file's existing inconsistent numbering" call).

- [x] 6a.1 Write a failing presentation test in `HazardousEventDetailPage.test.tsx` asserting that
  for a role with `EditData` permission (`"admin"`) and an editable `workflowStatus` (`"DRAFT"`),
  neither a link to `he-preview/edit/{id}` nor a link to `he-preview/new?parent={id}` renders, and
  that the "Back to Hazardous events" link still renders (spec:
  `hazardous-event-detail-page`/`hazardous-event-route-adapter` — both now require this). Verify
  with `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing — both links currently render for this role/status combination).
- [x] 6a.2 Remove the entire existing `describe("Edit link and add-cause link", ...)` block
  (confirmed to span lines 1033-1147, immediately followed by the outer describe's closing brace at
  1148 — re-verify exact bounds before deleting) and the now-unused locale mock entries at lines
  102-103 (`edit: "Edit"`, `add_cause: "Add hazardous event caused by this event"` — confirmed via
  grep that nothing else in this test file references them).
- [x] 6a.3 Implement the removal in `HazardousEventDetailPage.tsx`: delete the Edit/Add-cause JSX
  block (the `canAddCause && (...)` wrapper containing both links), the `canAddCause`/`canEditNow`
  locals, and the `roleHasPermission`/`isStatusAwareEditBlocked` imports — confirmed unused
  elsewhere in this file by grep. Do **not** touch `isStatusAwareEditBlocked.ts`/`.test.ts`
  themselves — still used by `HazardousEventListPage.tsx` and `requestAuthorizationGuards.server.ts`.
  Temporarily keep the `role?: string | null` prop on the component's type/destructuring (sequencing
  note: removing the prop in the same step as the JSX would make 6a.1's test an excess-prop `tsc`
  error before the test file itself is updated). Verify the 6a.1 test passes (green).
- [x] 6a.4 Remove the `role?: string | null` prop from `HazardousEventDetailPage`'s props type and
  destructuring (confirmed unused in this file now that 6a.3 is done). Update 6a.1's test (and
  confirm via grep no other test remaining in this file passes a `role=` prop) to drop the
  now-unused argument. Verify `yarn tsc` is clean (no excess-prop error) and re-run the full
  `HazardousEventDetailPage.test.tsx` file (green, no regressions).
- [x] 6a.5 Write a failing integration test in
  `tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts` asserting
  the loader's return value does **not** include a `role` field, replacing the existing "includes
  the resolved role alongside the detail DTO (design.md Decision 16)" test (confirmed at lines
  208-218 — that comment's "design.md Decision 16" cite belongs to a different, already-archived
  change; design.md Decision 11 explains this). Verify with
  `yarn vitest run tests/integration/domains/hazardous-events/routes/HazardousEventDetailRoute.test.ts`
  (failing — the loader still returns `role` today).
- [x] 6a.6 In `app/routes/$lang+/_authenticated+/he-preview+/$id.tsx`: change
  `const role = await requireViewDataPermission({ request });` to a bare
  `await requireViewDataPermission({ request });` — **keep the call itself**, it's a real `ViewData`
  authorization gate (403s otherwise), shared with the list loader; only the captured return value
  goes away. Remove `role` from the loader's returned object (`return { ...dto, role }` →
  `return { ...dto }`) and remove the `role={data.role}` prop pass in the route's default-exported
  component. Replace the stale "design.md Decision 16" comment with one citing this change's own
  Decision 11. Verify the 6a.5 test passes (green).
- [x] 6a.7 Confirm (don't assume) that the existing "rejects a session without ViewData with a 403
  FORBIDDEN, without calling the use case" test in the same file still covers
  `requireViewDataPermission`'s authorization side-effect independently of the removed
  role-capture test, so no coverage is lost. Re-run the full
  `HazardousEventDetailRoute.test.ts` file (green).
- [x] 6a.8 Remove the `"add_cause"` key (`detail.add_cause`) from `locales/en/hazardous-events.json`
  — confirmed via full-repo grep (`app/`, `locales/`, `tests/`) that its only usages were the
  removed JSX and the removed test file. Remove the matching French key from
  `locales/fr/hazardous-events.json` (confirmed present at the same `detail.add_cause` path, value
  "Ajouter un événement dangereux causé par cet événement"). **Do not** remove the `"edit"` key —
  still used by `HazardousEventListPage.tsx:217` (`aria-label={t("detail.edit")}`) for that page's
  own, separate Edit action.
- [x] 6a.9 Add this change's own new `## MODIFIED Requirements` delta at
  `openspec/changes/ca-he-detail-page-rebuild/specs/hazardous-event-route-adapter/spec.md` (new
  capability for this change, discovered during verification — not anticipated by the original
  proposal). It corrects three Requirements in the merged main spec
  `openspec/specs/hazardous-event-route-adapter/spec.md`, confirmed via read to currently mandate
  exactly the chrome this section removes: "HE detail loader resolves and returns the acting role,"
  "HE detail page renders an 'Edit' link...," and "HE detail page renders an 'Add hazardous event
  caused by this event' link...." Without this delta, archiving this change would leave the main
  spec set self-contradictory (that spec still mandating the links while
  `hazardous-event-detail-page`'s own corrected requirement, section above, forbids them). Verify
  with `openspec validate ca-he-detail-page-rebuild --strict` that the new delta parses.
- [x] 6a.10 Confirm via `git diff`/full-repo grep that this section's removal didn't leave any other
  stale reference to `detail.add_cause`, `he-preview/edit/`-from-the-detail-page, or "design.md
  Decision 16" (outside the `2026-11-04-ca-he-route-adapter-write` archive, which is historical
  record and stays untouched) in `app/`, `tests/`, or `locales/`.

## 6. Gate 9 follow-up corrections (hazard code, linked-events wording, stacked field rendering,
   embedded line breaks)

Closes the three items design.md Decision 7 Addendum 2 flagged as "needs a human call" rather
than fixed, per explicit user decision (2026-11-17, design.md Decision 10) — all three resolved
here, none deferred. Fix 4 (tasks 6.15-6.17) is a fourth, later item closing a Gate 8 code-review
finding (tasks.md 8.8) raised against Fix 3's own `ReviewField` extraction, not one of the
original three Decision 7 Addendum 2 items — added to this section rather than a new one so the
`ReviewField`-related fixes stay together and no task numbers elsewhere in this file need to
shift.

### Fix 1 — Specific hazard taxonomy code

- [x] 6.1 Write a failing PGlite integration test in
  `tests/integration/db/queries/DrizzleSpecificHazardTaxonomyRepository.test.ts`'s existing
  `findNamesByIds` describe block: assert the resolved map entry also includes
  `specificHazardCode` equal to the seeded `specific_hazard.code` value. Verify with
  `yarn vitest run tests/integration/db/queries/DrizzleSpecificHazardTaxonomyRepository.test.ts`
  (failing — `specificHazardCode` is not yet selected or returned).
- [x] 6.2 Add `specificHazardCode: string` to `SpecificHazardTaxonomyNames`
  (`ISpecificHazardTaxonomyRepository.ts`) and select `specificHazardTable.code` in
  `DrizzleSpecificHazardTaxonomyRepository.server.ts`'s `findNamesByIds` query (design.md Decision
  10, Fix 1). Verify the 6.1 test passes. Fix the resulting `yarn tsc` errors at every literal
  `SpecificHazardTaxonomyNames` construction site — confirmed today at
  `GetHazardousEventById.test.ts` (three fixture literals: base event, cause, effect) — by adding
  `specificHazardCode` to each.
- [x] 6.3 Write a failing test in `HazardousEventDetailDto.test.ts` asserting
  `toHazardousEventDetailDto` maps a resolved `specificHazardCode` onto the DTO, and maps to
  `null` when no taxonomy match exists (mirroring the existing
  `specificHazardName`/`hazardClusterName`/`hazardTypeName` null-handling). Verify with
  `yarn vitest run app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts`
  (failing).
- [x] 6.4 Add `specificHazardCode: string | null` to `HazardousEventDetailDto` and populate it in
  `toHazardousEventDetailDto` from the same `taxonomyNames` lookup already used for the other
  three name fields. Verify the 6.3 test passes.
- [x] 6.5 Write a failing test in `GetHazardousEventById.test.ts` asserting the resolved event's
  `specificHazardCode` flows from the existing `taxonomyNames` map lookup onto the returned DTO
  (no new repository call — same batched `findNamesByIds` call already used for
  `specificHazardName`/etc.). Verify with
  `yarn vitest run app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`
  (failing).
- [x] 6.6 Confirm (don't assume) whether `GetHazardousEventById` needs any change beyond what 6.4's
  DTO-mapper change already provides, since it already forwards `taxonomyNames.get(...)` into
  `toHazardousEventDetailDto` for the other three name fields; wire through explicitly if it does
  not already. Verify the 6.5 test passes.
- [x] 6.7 Write a failing presentation test in `HazardousEventDetailPage.test.tsx`'s "Hazard
  details Card" describe block covering the three new spec scenarios (spec:
  `hazardous-event-detail-page` — "The Specific hazard field appends its taxonomy code when one is
  resolved"): a resolved name with a non-empty `specificHazardCode` renders "name (code)"; a
  resolved name with `specificHazardCode` null or `""` renders the name alone, no parentheses; the
  raw-id fallback case (`specificHazardLocalName`/`specificHazardNationalName`/`specificHazardName`
  all null) never appends a code even when `specificHazardCode` is non-empty. Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing).
- [x] 6.8 Implement the "name (code)" composition in `HazardousEventDetailPage.tsx`'s Hazard
  details Card (design.md Decision 10, Fix 1) — do not modify `hazardLabel.ts` (shared with
  `HazardousEventFormPage`/`HazardousEventListPage`, out of scope). Verify the 6.7 test passes.

### Fix 2 — Linked-events empty-state wording (confirmation only, no code change)

- [x] 6.10 Confirm, do not re-litigate, that `locales/en/hazardous-events.json`'s existing
  `detail.linked_events.no_cause`/`no_effects` strings ("No cause recorded"/"No effects recorded")
  are the finalized wording, per design.md Decision 10's fuller legacy investigation (legacy's real
  per-direction empty state is a generic "None", `common.none`, not a distinguishable per-direction
  phrase — kept as-is for consistency with every other empty-state message already on this page).
  No production or locale file change for this fix. Confirm the existing assertions in
  `HazardousEventDetailPage.test.tsx` (already asserting `hazardousEvents.detail.linked_events
  .no_cause`/`no_effects`) still pass unchanged — they are the already-existing proof this wording
  is shipped and tested; this task only records the decision in the spec/design artifacts, already
  done above.

### Fix 3 — Stacked label/value field rendering

- [x] 6.11 Write a failing test for a new `ReviewField` component in
  `app/domains/hazardous-events/presentation/web/ReviewField.test.tsx`: given a `label` string and
  a `ReactNode` value, it renders a `<div className="space-y-1">` containing the label in one `<p>`
  and the value in a second `<p>`, with legacy's exact Tailwind classes (design.md Decision 10,
  Fix 3: label `text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500`, value
  `text-[14px] leading-[18px] font-semibold text-slate-800`). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/ReviewField.test.tsx` (failing —
  the file does not exist yet).
- [x] 6.12 Implement `app/domains/hazardous-events/presentation/web/ReviewField.tsx`. Verify the
  6.11 test passes.
- [x] 6.13 Update the existing `HazardousEventDetailPage.test.tsx` assertions that currently match
  inline `<strong>{label}:</strong> value` HTML for Basic information and Hazard details fields (as
  of this amendment: the Basic information Card's field-value assertions, the dash-fallback
  regexes for Basic information/Hazard details fields, and the Type/Cluster and Start/End-date
  2-column-grid regexes — these scan to the first `</div>` and will close immediately inside each
  field's own new `ReviewField` wrapper div, before reaching the next field) to assert the new
  stacked markup instead. Run
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  and confirm these specific rewritten assertions now fail against the still-inline production code
  (red).
- [x] 6.14 Replace every `Field` usage in the Basic information and Hazard details Cards with
  `ReviewField`; keep the existing `Field` function unchanged, still used by the Location Card's
  two fields (Observation time, Note) only — an explicit, documented scope boundary (design.md
  Decision 10, Fix 3), not an oversight. Correct `Field`'s doc comment, since it currently claims to
  cover "every field in every Card." Verify the 6.13 assertions now pass (green).

### Fix 4 — Embedded line breaks on National specification, Description, and Chains explanation

- [x] 6.15 Write a failing test in `ReviewField.test.tsx` (new `describe`/`it` blocks alongside the
  two existing ones): given `preserveLineBreaks={true}`, the value `<p>` renders with
  `whitespace-pre-line` appended to its existing className; given no `preserveLineBreaks` prop (or
  `false`), the value `<p>`'s className renders byte-identical to the existing first test's
  asserted string (no `whitespace-pre-line`, no trailing space) — the existing first test's exact
  assertion must keep passing unchanged, proving the new prop is opt-in, not a default-on change.
  Also assert that a value string containing an embedded `"\n"` is preserved verbatim in the
  `renderToString` output when `preserveLineBreaks={true}` (note in the test: this only proves the
  newline character itself survives serialization, not how a browser visually renders
  `whitespace-pre-line` — that part of the behavior is CSS, not something `renderToString` can
  observe). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/ReviewField.test.tsx` (failing —
  `preserveLineBreaks` does not exist on `ReviewField`'s props yet).
- [x] 6.16 Add `preserveLineBreaks?: boolean` to `ReviewField`'s props (design.md Fix 4) and apply
  it conditionally to the value `<p>`'s className only when `true`, via string concatenation that
  leaves the `false`/absent case's className exactly as it is today (no trailing space, no empty
  class appended). Verify the 6.15 tests pass (green).
- [x] 6.17 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Hazard details
  Card" `describe` block (line 380) asserting that National specification, Description, and
  Chains explanation each render with `whitespace-pre-line` in their value `<p>`'s className, and
  that at least one other field already rendered via `ReviewField` in this Card or in the Basic
  information Card (e.g. Record originator) does not — proving the fix is scoped to these three
  fields only, not applied globally. Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing). Then wire `preserveLineBreaks={true}` onto exactly these three `ReviewField` call
  sites in `HazardousEventDetailPage.tsx`'s Hazard details Card (National specification,
  Description, Chains explanation — lines 169-180 as of this amendment); no other call site in
  Basic information or Hazard details passes this prop. Verify the new 6.17 assertions pass
  (green), and re-run the full `HazardousEventDetailPage.test.tsx` and `ReviewField.test.tsx` files
  to confirm no existing assertion (including the three field sets' own dash-fallback and
  2-column-grid assertions from task 6.13) regressed.

## 6b. Back-link correction — text, outlined-button style, spacing (second correction round,
    2026-11-17)

Scoped by the human user to only the "Back to Hazardous events" back-link: its text, visual
style, and its spacing relative to the title above and the first Card below (design.md Decision
12). Icons/label mismatches elsewhere on the page are explicitly out of scope here, for a later
round. Numbered "6b" rather than renumbering, same practice as 6a.

- [x] 6b.1 Write a failing test in a new
  `app/domains/hazardous-events/presentation/web/BackLink.test.tsx` asserting: it renders an `<a>`
  with the given `href`, the given `label` as its visible text, a leading `<svg
  aria-hidden="true">` before the text, and a `className` containing `rounded-[6px]`, `border`,
  `border-blue-500`, `text-blue-500`, `py-[0.65625rem]`, `px-[1.09375rem]`, `text-sm`,
  `font-normal`, and `gap-2` (design.md Decision 12's exact class list, corrected for this app's
  real 14px root font-size — see Decision 12's "Root font-size correction" note; do not use
  `rounded-md`/`px-4`/`py-2.5`/`text-xs`/`gap-[7px]`, which were an earlier, 16px-root-assuming
  draft). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/BackLink.test.tsx` (failing — the
  file does not exist yet).
- [x] 6b.2 Implement `app/domains/hazardous-events/presentation/web/BackLink.tsx`: `{ href:
  string; label: string }` props, rendering the design-system `Link` with the `className` override
  from design.md Decision 12 and the hand-rolled inline arrow SVG. Verify the 6b.1 test passes.
- [x] 6b.3 Add the new locale key `detail.back_to_list` ("Back to Hazardous events") to
  `locales/en/hazardous-events.json` and ("Retour aux événements dangereux") to
  `locales/fr/hazardous-events.json`, in the existing `detail.*` namespace alongside `detail.edit`.
  Do not touch the top-level `title` key — still used elsewhere.
- [x] 6b.4 Update the two existing back-link assertions in `HazardousEventDetailPage.test.tsx`
  (the "renders a back-to-list link above the heading" test at line 197, and the "renders neither
  the Edit link nor the add-cause link, but still renders the back link" test at line 1034) to
  also assert the link's visible text is "Back to Hazardous events" (via the
  `hazardousEvents.detail.back_to_list` fixture string, not `hazardousEvents.title`) and that its
  `className` contains `rounded-[6px]`/`border-blue-500` (proof it is the new `BackLink`, not the old
  plain `Link`). Run both tests and confirm they now fail against the still-unchanged production
  code (red).
- [x] 6b.5 Write a failing test in `HazardousEventDetailPage.test.tsx` asserting the back-link's
  own wrapper element carries `mb-4` in its `className` (design.md Decision 12's spacing fix,
  corrected for this app's real 14px root — not `mb-3.5`, an earlier draft's 16px-root-assuming
  value).
  Verify failing.
- [x] 6b.6 In `HazardousEventDetailPage.tsx`, replace the existing `<p><Link
  href={ctx.url("/he-preview")}>{t("title")}</Link></p>` block (lines 44-47) with `<BackLink
  href={ctx.url("/he-preview")} label={t("detail.back_to_list")} />`, importing `BackLink` and
  removing the now-unused `t("title")` call site at this location (the top-level `t("title")` call
  itself may still be used elsewhere in this file — confirm via grep before removing any import).
  Verify the 6b.4 and 6b.5 tests pass (green), and re-run the full
  `HazardousEventDetailPage.test.tsx` file to confirm no other assertion regressed.
- [x] 6b.7 Run `npx prettier --check` scoped to every file touched by this section
  (`BackLink.tsx`, `BackLink.test.tsx`, `HazardousEventDetailPage.tsx`,
  `HazardousEventDetailPage.test.tsx`, both locale files) — do not run a bare `yarn format`
  repo-wide.
- [x] 6b.8 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the updated
  `hazardous-event-detail-page` spec delta (new back-link scenarios) parses cleanly.

## 6c. Card header icons, field-grid spacing, Hazard details field labels (third correction
    round, 2026-11-18)

A fresh, careful manual-review round the human user did directly against the real current legacy
page found three further, independent, already-well-understood gaps (design.md Decision 13) —
bundled into one round since no further investigation is needed. Numbered "6c" rather than
renumbering, same practice as 6a/6b.

### Fix 1 — Card header icons

- [x] 6c.1 Write a failing test in a new `app/design-system/components/Card.test.tsx`: given an
  `icon` prop (e.g. `"pi-info-circle"`), the Card renders a `<div className="flex items-center
  gap-2 text-slate-800">` containing an `<i aria-hidden="true">` whose className contains `pi
  pi-info-circle text-blue-600`, followed by the existing `<h2>` title; given no `icon` prop, the
  Card renders its current markup unchanged (bare `<h2>`, no wrapper div, no `<i>`) — proving the
  prop is opt-in (design.md Decision 13, Fix 1). Verify with
  `yarn vitest run app/design-system/components/Card.test.tsx` (failing — `icon` does not exist on
  `CardProps` yet).
- [x] 6c.2 Add `icon?: string` to `CardProps` and render it per design.md Decision 13's exact
  markup. Verify the 6c.1 test passes.
- [x] 6c.3 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Basic
  information Card", "Hazard details Card", and "Location Card" describe blocks: each Card's
  rendered header `<i>` className contains `pi-info-circle`, `pi-map-marker`, and `pi-map-marker`
  respectively (plus `text-blue-600`). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing).
- [x] 6c.4 Wire `icon="pi-info-circle"` / `icon="pi-map-marker"` / `icon="pi-map-marker"` at the
  three direct `<Card>` usages in `HazardousEventDetailPage.tsx` (Basic information, Hazard
  details, Location). Verify the 6c.3 tests pass.
- [x] 6c.5 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Attachments
  Card" describe block asserting its header `<i>` className contains `pi-paperclip`. Verify
  failing.
- [x] 6c.6 Wire `icon="pi-paperclip"` on `HazardousEventAttachmentsCard.tsx`'s own `<Card>` call.
  Verify the 6c.5 test passes.
- [x] 6c.7 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Linked events
  Card" describe block asserting its header `<i>` className contains `pi-link`. Verify failing.
- [x] 6c.8 Wire `icon="pi-link"` on `HazardousEventLinkedEventsCard.tsx`'s own `<Card>` call.
  Verify the 6c.7 test passes.
- [x] 6c.9 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Audit log
  history Card" describe block asserting its header `<i>` className contains `pi-history`. Verify
  failing.
- [x] 6c.10 Wire `icon="pi-history"` on `HazardousEventAuditLogCard.tsx`'s own `<Card>` call.
  Verify the 6c.9 test passes, then re-run the full `HazardousEventDetailPage.test.tsx` file to
  confirm no existing assertion regressed.

### Fix 2 — Basic information/Hazard details field-grid spacing

- [x] 6c.11 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Basic
  information Card" and "Hazard details Card" describe blocks: the Basic information field-wrapper
  div, the Hazard details Type/Cluster field-wrapper div, and the Hazard details Start/End-date
  field-wrapper div each carry `className="grid grid-cols-1 gap-6 md:grid-cols-2"` (not `mg-grid
  mg-grid__col-2`). Verify with
  `yarn vitest run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`
  (failing — red against the current `mg-grid mg-grid__col-2` classes).
- [x] 6c.12 In `HazardousEventDetailPage.tsx`, replace `mg-grid mg-grid__col-2` with the literal
  `grid grid-cols-1 gap-6 md:grid-cols-2` at all three wrapper divs (design.md Decision 13, Fix
  2), and delete the two now-inaccurate code comments directly above the Basic information and
  Hazard details Cards ("Legacy's 2-column grid for this Card; not approximable..." and "Legacy
  pairs these fields in a 2-column grid; not approximable...") — no replacement comment needed,
  since the literal class list is legacy's own and self-explanatory. Verify the 6c.11 tests pass.

### Fix 3 — Hazard details field labels

- [x] 6c.13 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Hazard details
  Card" describe block asserting the rendered labels are "Hazard type", "Hazard cluster", and
  "Specific hazard" (not "Type"/"Cluster"/"Hazard"). Verify failing.
- [x] 6c.14 Add `hazard_type: "Hazard type"`, `hazard_cluster: "Hazard cluster"`,
  `specific_hazard: "Specific hazard"` to the existing `detail.fields.*` namespace in
  `locales/en/hazardous-events.json` (reusing this file's own existing
  `form.fields.hazard_type`/`hazard_cluster`/`specific_hazard` wording verbatim), and the matching
  French translations ("Type de danger" / "Groupe de risques" / "Risque spécifique", reusing
  `form.fields.hazard_type`/`hazard_cluster`/`specific_hazard`'s own existing French values) to
  `locales/fr/hazardous-events.json` (design.md Decision 13, Fix 3). Wire the three Hazard details
  `ReviewField` label calls in `HazardousEventDetailPage.tsx` from
  `detail.classification.type`/`cluster`/`hazard` to
  `detail.fields.hazard_type`/`hazard_cluster`/`specific_hazard`. Verify the 6c.13 test passes.
- [x] 6c.15 Remove the now-unused `detail.classification.type`/`cluster`/`hazard` keys from both
  locale files — confirmed via repo-wide grep that only `detail.classification.heading` (still
  used by `HazardousEventHazardPicker.tsx:57`) remains under this namespace; `heading` is
  untouched. Re-run a full-repo grep to confirm no other stale reference to the three removed
  keys remains.

### Close-out

- [x] 6c.16 Run `npx prettier --check` scoped to every file touched by this section
  (`Card.tsx`, `Card.test.tsx`, `HazardousEventDetailPage.tsx`, `HazardousEventDetailPage.test.tsx`,
  `HazardousEventAttachmentsCard.tsx`, `HazardousEventLinkedEventsCard.tsx`,
  `HazardousEventAuditLogCard.tsx`, both locale files) — do not run a bare `yarn format`
  repo-wide.
- [x] 6c.17 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the updated
  `hazardous-event-detail-page` spec delta (the three new Requirements) parses cleanly.

## 6d. Specific-hazard grid placement, per-card content spacing, and three further parity gaps
    (fourth correction round, fixing 6c's own mistake, 2026-11-18)

A real live-Chrome screenshot side-by-side comparison (not DOM/text inspection) against record
`afa94a20-6f47-4a18-be6a-24a18963d346` caught a defect in 6c's own work (design.md Decision 14):
zero spacing between a Card's direct content blocks wherever a Card has more than one, and a
Hazard details field miscount (two fields instead of legacy's real three) that traces back further
than 6c. A deeper legacy read done for this same round surfaced three further, independent parity
gaps, folded in here per explicit instruction rather than split off. Numbered "6d" rather than
renumbering, same practice as 6a/6b/6c.

**Important, read before starting:** an earlier draft of this round proposed one shared
`space-y-6` wrapper inside `app/design-system/components/Card.tsx`. That approach is **rejected** —
design.md Decision 14 confirms legacy uses different spacing values for different Cards (21px for
Basic information/Hazard details, 14px/17.5px for Location/Attachments/Linked events/Audit log),
so no single Card.tsx-level value is correct for all six. **`Card.tsx` is not touched by this
section at all.**

### Fix 1 — Specific hazard grid placement

- [x] 6d.1 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Hazard details
  Card" describe block, replacing the existing "wraps Hazard type and Hazard cluster in legacy's
  2-column grid class" test (misnamed and no longer sufficient — rename to "wraps Hazard type,
  Hazard cluster, and Specific hazard in legacy's 2-column grid class"). The existing regex at
  this test does not distinguish the current (wrong) structure from the fixed one — its lazy
  `[\s\S]*?` match expands straight through Specific hazard's own wrapper div either way — so do
  not reuse it uncritically. Assert instead that the grid div containing Hazard cluster closes with
  exactly one `</div>` before Specific hazard's own field block starts (not two, i.e. not a grid
  boundary in between), e.g. a pattern anchored on `Hazard cluster<\/p><p[^>]*>[^<]*<\/p><\/div><div
  class="space-y-1"><p[^>]*>Specific hazard`, and that the grid closes (two consecutive `</div>`)
  only after Specific hazard's own block, immediately before the Start/End-date grid starts.
  Verify RED against the current code with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` — confirm it is
  actually red before proceeding (design.md Decision 14 explains why the naive regex would not be).
- [x] 6d.2 In `HazardousEventDetailPage.tsx`'s Hazard details Card, move the Specific hazard
  `ReviewField` (currently a standalone block between the two grids) into the first grid div, as
  the third item after Hazard cluster (design.md Decision 14, Root cause 2). Verify the 6d.1 test
  passes, and re-run the full `HazardousEventDetailPage.test.tsx` file to confirm no other
  assertion regressed — in particular the existing "renders Specific hazard label and value
  adjacent" test (~line 509), which matches only the label/value pair inside `ReviewField` and is
  unaffected by the field's grid position.

### Fix 2 — Hazard details content spacing

- [x] 6d.3 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Hazard details
  Card" describe block asserting that, for a record with National specification, Description, and
  Chains explanation all populated, the Hazard details Card's direct content (the first grid, the
  second grid, and the three standalone fields) is wrapped in a `<div class="space-y-6">`, scoped
  to this Card only (design.md Decision 14: a local wrapper in `HazardousEventDetailPage.tsx`, not
  a `Card.tsx` change). Verify RED with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`.
- [x] 6d.4 In `HazardousEventDetailPage.tsx`, wrap the Hazard details Card's children in a local
  `<div className="space-y-6">`. Verify the 6d.3 test passes, and re-run the full
  `HazardousEventDetailPage.test.tsx` file to confirm no existing Hazard details assertion
  regressed.

### Fix 3 — Location content spacing

- [x] 6d.5 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Location Card"
  describe block asserting that, for a record with a non-null `currentSpatialObservation`, the
  Location Card's three content elements (Observation time `Field`, Note `Field`, map) are wrapped
  in a `<div class="space-y-5">`; and a second assertion that the empty-state branch (`null`
  observation) renders unchanged, with no such wrapper around its single `<p>`. Verify RED.
- [x] 6d.6 In `HazardousEventDetailPage.tsx`'s Location Card, wrap the populated branch's three
  elements in a local `<div className="space-y-5">`, leaving the empty-state branch unchanged.
  Verify the 6d.5 tests pass, and re-run the full `HazardousEventDetailPage.test.tsx` file to
  confirm the existing Location Card assertions (map rendering, empty-state rendering) did not
  regress.

### Fix 4 — Linked events rebuild (bordered card, subtitle, internal grouping)

- [x] 6d.7 Write a failing test in `HazardousEventDetailDto.test.ts` (new cases alongside the
  existing `cause`/`effects` mapping tests, ~lines 186-187, 210-211) asserting
  `toHazardousEventDetailDto` passes a resolved `specificHazardCode` and `description` through on
  both `cause` and `effects` objects, unchanged from whatever `GetHazardousEventById` supplies (no
  new mapping logic at the DTO-construction function itself — mirrors how `cause`/`effects` are
  already passed through today). Verify RED with `yarn vitest run
  app/domains/hazardous-events/application/dto/HazardousEventDetailDto.test.ts` — `tsc` will also
  flag the existing literal fixtures at these two line ranges as missing the new required fields;
  fix those fixtures as part of this task, not as an afterthought.
- [x] 6d.8 Add `specificHazardCode: string | null` and `description: string` to both `cause` and
  `effects` on `HazardousEventDetailDto` (design.md Decision 14, Finding 6 — no new top-level DTO
  field, both existing objects widened). Verify the 6d.7 test passes.
- [x] 6d.9 Write a failing test in `GetHazardousEventById.test.ts` (new cases; existing `cause`/
  `effects` literal sites that need updating for the new required fields are at ~lines 761-762,
  792-793, 922-923, 998 — fix those fixtures as part of this task) asserting the resolved
  `specificHazardCode` (from the already-fetched `taxonomyNames` map, same lookup Decision 10
  Fix 1 added) and `description` (from the already-resolved `causeEvent`/`effectEvent` domain
  object) are populated on both `cause` and `effects` — no new repository or query call. Verify RED
  with `yarn vitest run
  app/domains/hazardous-events/application/use-cases/GetHazardousEventById.test.ts`.
- [x] 6d.10 Wire `GetHazardousEventById.ts:152-171`'s `cause`/`effects` construction to populate
  the two new fields from the values already in scope at that point (design.md Decision 14).
  Verify the 6d.9 test passes.
- [x] 6d.11 Add new locale keys to `locales/en/hazardous-events.json` and
  `locales/fr/hazardous-events.json`: `detail.linked_events.hip_label` ("HIP" / "HIP"),
  `.uuid_label` ("UUID" / "UUID"), `.unresolved_event` ("Hazardous event" / "Événement dangereux")
  (design.md Decision 14 — deliberately routed through `t()`, unlike legacy's own raw,
  untranslated "HIP: "/"UUID: " prefixes, for consistency with every other string on this page).
- [x] 6d.12 Write a failing test for a new, small composition helper (e.g.
  `linkedEventSubtitle.ts` in `app/domains/hazardous-events/presentation/web/`) that, given a
  resolved linked-event entry's `specificHazardCode`, `description`, `displayName`, and `id`,
  returns the title string (`displayName || description || "{unresolved_event}: {id8}"`) and the
  subtitle string (`"HIP: {code}"` / `description` when it differs from the title / `"UUID:
  {id8}"`, each omitted when empty, joined with `" • "` — mirrors legacy's own
  `.filter(Boolean).join(" • ")` recipe at `HazardousEventReviewStep.tsx:468-474`). Verify RED with
  `yarn vitest run app/domains/hazardous-events/presentation/web/linkedEventSubtitle.test.ts`
  (file does not exist yet).
- [x] 6d.13 Implement the helper. Verify the 6d.12 test passes.
- [x] 6d.14 Write failing tests in `HazardousEventDetailPage.test.tsx`'s existing "Linked events
  Card" describe block (replacing/extending the two existing tests at ~lines 944-1007, which assert
  a bare `<a href=...>` — their substring/`toContain` assertions on `displayName`/
  `causalityExplanation` text remain valid once wrapped, but add new assertions for what they do
  not yet check): each resolved `cause`/`effects` entry renders inside a bordered-card wrapper
  (the `rounded-xl border` classes), with its composed title, its composed subtitle (HIP code and
  short id, when resolved), and `causalityExplanation` on its own line beneath the subtitle, not
  appended into the subtitle text; and a title-fallback case where `displayName` is empty and
  `description` is non-empty renders the description as the title. Verify RED with `yarn vitest
  run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx`.
- [x] 6d.15 Write a failing test in `HazardousEventDetailPage.test.tsx`'s "Linked events Card"
  describe block asserting the "Caused by" group's own label and its rendered entry/empty-state
  are wrapped together (tightly spaced), the "Causing" group's label and its rendered entry/
  empty-state are wrapped together the same way, and the two groups are spaced apart from each
  other by a wider gap than either group's own internal spacing (design.md Decision 14's
  "Linked events rebuild" — legacy's `space-y-2` within each group, `space-y-4` between groups,
  `HazardousEventReviewStep.tsx:836-878`). Verify RED.
- [x] 6d.16 Implement 6d.14/6d.15 together in `HazardousEventLinkedEventsCard.tsx`: restructure
  the Card's three flat siblings into two nested groups ("Caused by" + its entry, "Causing" + its
  entry/entries), each rendering through the new bordered-card markup and the 6d.13 helper for
  title/subtitle, with the narrower within-group gap and the wider between-group gap. Keep the
  existing `<ul>`/`<li>` wrapper for multiple effects (existing test guard at
  `HazardousEventDetailPage.test.tsx:798-799` already asserts this Card legitimately renders a
  `<ul>` — do not remove it). Verify the 6d.14 and 6d.15 tests pass, and re-run the full
  `HazardousEventDetailPage.test.tsx` file to confirm the two existing Linked-events tests at
  ~lines 944-1007 (now wrapping different markup) and the no-cause/no-effects empty-state tests
  still pass.

### Fix 5 — Attachment tags render as styled pills

- [x] 6d.17 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Attachments
  Card" describe block asserting an attachment with one or more tags renders each tag as its own
  pill element (not a single comma-joined text node), and that an attachment with no tags still
  renders this page's own existing `"—"` empty-tags fallback (design.md Decision 14, Finding 4 —
  deliberately not legacy's own `"-"`, for consistency with this page's established dash
  convention). Verify RED.
- [x] 6d.18 In `HazardousEventAttachmentsCard.tsx`, replace the `attachment.tag.map(t =>
  t.name).join(", ")` cell with one pill span per tag, matching legacy's exact classes
  (`HazardousEventReviewStep.tsx:761-774`). No DTO/data change — `attachment.tag` already carries
  everything needed. Verify the 6d.17 test passes.

### Fix 6 — Attachment File/URL column: type icon and file size

- [x] 6d.19 Write a failing test for a new `getFileIconClass`-equivalent helper (e.g.
  `attachmentFileIconClass.ts` in `app/domains/hazardous-events/presentation/web/`): given a file
  name, returns the matching PrimeIcon class for each of legacy's seven extension buckets (pdf,
  doc/docx, xls/xlsx, ppt/pptx, jpg/png/gif/webp, mp3/wav/m4a, mp4/mov —
  `HazardousEventReviewStep.tsx:280-292`) and the `pi-file` default for anything else, including no
  extension. Verify RED (file does not exist yet).
- [x] 6d.20 Implement the helper. Verify the 6d.19 test passes.
- [x] 6d.21 Write a failing test for a new `formatFileSize`-equivalent helper (e.g.
  `formatAttachmentFileSize.ts`): given a byte count, returns legacy's exact binary-unit string
  (B/KB/MB/GB, one decimal place under 10 units, whole number at 10+ —
  `HazardousEventReviewStep.tsx:261-278`). Verify RED.
- [x] 6d.22 Implement the helper. Verify the 6d.21 test passes.
- [x] 6d.23 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Attachments
  Card" describe block: a file-type attachment with a known positive `fileSize` renders a leading
  type icon and a trailing size suffix; a file-type attachment with `fileSize: null` renders the
  leading icon but no size suffix (not a "0 B" fallback — guard on `typeof fileSize === "number" &&
  fileSize > 0` before calling the helper, since CA's `fileSize` is `number | null`, unlike
  legacy's plain `number`); a link-type attachment's existing rendering (URL text, href) is
  unchanged, gaining only the trailing external-link icon. Verify RED.
- [x] 6d.24 Wire the two new helpers into `HazardousEventAttachmentsCard.tsx`'s File/URL cell per
  design.md Decision 14, Finding 5. Do not change how the Link branch's URL text itself is
  computed — `attachmentLink.ts` already supplies it and stays untouched (legacy's own `displayUrl`
  computation lives inside `parseAttachments`, which this change has never ported — see the
  Context section's ground truth and Decision 6). Verify the 6d.23 test passes, and re-run the
  full `HazardousEventDetailPage.test.tsx` and `HazardousEventAttachmentsCard`-covering tests to
  confirm no existing Attachments assertion regressed.

### Test quality

- [x] 6d.25 Skipped per a standing user decision for the whole `ca-he-detail-page-rebuild` change
  (relayed by the coordinator 2026-11-18; not previously recorded in this change's artifacts) —
  not a tooling-blocked judgment call for this round specifically. Not re-opened; no
  mutation-testing task is reintroduced in any later round of this change unless explicitly
  requested.

### Close-out

- [x] 6d.26 Run `npx prettier --check` scoped to every file touched by this section
  (`HazardousEventDetailPage.tsx`, `HazardousEventDetailPage.test.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, `HazardousEventAttachmentsCard.tsx`,
  `HazardousEventDetailDto.ts`, `HazardousEventDetailDto.test.ts`, `GetHazardousEventById.ts`,
  `GetHazardousEventById.test.ts`, the new `linkedEventSubtitle.ts`/`.test.ts`,
  `attachmentFileIconClass.ts`/`.test.ts`, `formatAttachmentFileSize.ts`/`.test.ts`, both locale
  files) — do not run a bare `yarn format` repo-wide.
- [x] 6d.27 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the updated
  `hazardous-event-detail-page` spec delta (the corrected Hazard-details-grid scenario, the two
  new `## ADDED Requirements`, and the extended Attachments/Linked-events `## MODIFIED
  Requirements` blocks) parses cleanly.

## 6e. Icon alignment, Card shadow, Record-status order, Linked-events labels, attachment link
    styling, shared "cozy" table padding, and the Audit log table rebuild (fifth correction
    round, 2026-11-18)

A large, bundled round, already independently investigated and verified by the orchestrator
against real source code and live DOM measurements (design.md Decision 15) — grouped by fix
number below so each fix's own RED-first task pair is clear. Numbered "6e" rather than
renumbering, same practice as 6a/6b/6c/6d.

**Read design.md Decision 15 in full before starting Fix 1 and Fix 8** — both have one part each
that is flagged for human confirmation, not fully decided: Fix 1's header-to-content gap
restoration (Part B) and Fix 8's Date/Time rendering choice. Both have a stated, lower-risk
default; implement the default, but do not treat either as closed until the human confirms it at
this round's own Gate 9 pass (task 8.9).

### Fix 1 — Card header icon vertical alignment (title size, Part A) and header-to-content gap
    (Part B, flagged default)

- [x] 6e.1 Write a failing test in `tests/unit/design-system/components/Card.test.tsx`: given
  `titleSize="sm"`, the title `<h2>` renders with `text-[16px] leading-[16px] font-semibold`
  (replacing `dts-heading-5`) and the icon wrapper carries a `mb-6` margin-bottom; given
  `titleSize="lg"`, the title renders with `text-[18px] leading-[24px] font-semibold` and the icon
  wrapper carries `mb-4`; given no `titleSize` at all (with `icon` given), the default behaves
  identically to `titleSize="lg"` (design.md Decision 15, Fix 1). Verify with
  `yarn vitest run tests/unit/design-system/components/Card.test.tsx` (failing — `titleSize` does
  not exist on `CardProps` yet, and the existing two tests in this file, which assert the current
  `dts-heading-5`-based markup with no `mb-*` class, must also now be updated to pass
  `titleSize="lg"` explicitly and assert the new default markup — confirm those two existing tests
  go red against the current code before changing them, so the before/after contrast is on
  record).
- [x] 6e.2 Add `titleSize?: "sm" | "lg"` to `CardProps` (default `"lg"`) and implement per design.md
  Decision 15, Fix 1: swap the title's className from `dts-heading-5` to the literal `sm`/`lg`
  class string, and add the matching `mb-6`/`mb-4` margin-bottom to the icon-wrapper `<div>` (the
  bare, no-`icon` branch is unused by any current caller and is left unchanged — do not add
  `titleSize` handling there). Verify the 6e.1 test passes.
- [x] 6e.3 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Basic
  information Card" and "Hazard details Card" describe blocks asserting each Card's header `<i>`
  no longer sits inside a `dts-heading-5`-styled title, and that the title renders
  `text-[16px] leading-[16px] font-semibold`. Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing).
- [x] 6e.4 Wire `titleSize="sm"` at the Basic information and Hazard details `<Card>` usages in
  `HazardousEventDetailPage.tsx`; wire `titleSize="lg"` at the Location `<Card>` usage in the same
  file and at the `<Card>` usage inside `HazardousEventAttachmentsCard.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, and `HazardousEventAuditLogCard.tsx`. Verify the 6e.3 test
  passes, and re-run the full `HazardousEventDetailPage.test.tsx` file to confirm no existing
  assertion regressed.

### Fix 2 — Card missing depth/shadow

- [x] 6e.5 Write a failing test in `tests/unit/design-system/components/Card.test.tsx` asserting
  `Card`'s rendered `className` contains
  `shadow-[0_2px_1px_-1px_rgba(0,0,0,0.2),0_1px_1px_0_rgba(0,0,0,0.14),0_1px_3px_0_rgba(0,0,0,0.12)]`
  and does not contain the literal string `shadow-none` (design.md Decision 15, Fix 2). Verify
  failing.
- [x] 6e.6 Replace `shadow-none` with the arbitrary-value shadow class in `Card.tsx`'s className.
  Verify the 6e.5 test passes, and re-run the full `Card.test.tsx` file to confirm the Fix 1 tests
  above did not regress.

### Fix 3 — "Record status" field position

- [x] 6e.7 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Basic
  information Card" describe block asserting the Record status field renders after Updated at
  (last in the sequence), not between Hazardous event status and Magnitude (design.md Decision 15,
  Fix 3). Use an ordering assertion (e.g. compare the label's index in the rendered HTML against
  Updated at's index), not a markup-shape assertion, since the fields are siblings in the same
  grid `<div>` either way. Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing).
- [x] 6e.8 In `HazardousEventDetailPage.tsx`'s Basic information Card, move the Record status
  `ReviewField` block to after the Updated at `ReviewField` block, within the same grid `<div>` (no
  markup change, pure reorder). Verify the 6e.7 test passes, and re-run the full
  `HazardousEventDetailPage.test.tsx` file to confirm no other Basic information assertion
  regressed (in particular, any existing test that locates a field by scanning forward from a
  fixed starting point).

### Fix 4 — "Caused by"/"Causing" label styling

- [x] 6e.9 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Linked events
  Card" describe block asserting the "Caused by" and "Causing" labels each render as
  `<p className="text-[13px] font-semibold text-slate-700">{label}</p>`, with no trailing colon
  and no `<strong>` wrapper (design.md Decision 15, Fix 4). Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing —
  confirm it is red against the current `<p><strong>{label}:</strong></p>` markup, not
  accidentally passing against a lazy substring match).
- [x] 6e.10 In `HazardousEventLinkedEventsCard.tsx`, replace both label `<p><strong>...:</strong>
  </p>` blocks with the new markup. Verify the 6e.9 test passes, and re-run the full
  `HazardousEventDetailPage.test.tsx` file to confirm the existing "Caused by"/"Causing" content
  assertions (empty-state text, entry rendering) did not regress — they must not depend on the
  colon or the `<strong>` wrapper that just changed.

### Fix 5 — Attachment link styling

- [x] 6e.11 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Attachments
  Card" describe block asserting both the Link-type and File-type attachment anchors render with
  `text-sm font-medium text-blue-700 hover:text-blue-800 hover:underline` in their `className`,
  alongside their existing layout classes (design.md Decision 15, Fix 5). Verify with `yarn vitest
  run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing).
- [x] 6e.12 Add the four classes to both `<a>` tags in `AttachmentLinkCellContent`
  (`HazardousEventAttachmentsCard.tsx`), appended to each anchor's existing className string.
  Verify the 6e.11 test passes.

### Fix 6 — `attachmentLink.ts` scheme allowlist (defense in depth)

- [x] 6e.13 Write a failing test in `attachmentLink.test.ts`'s existing suite (new cases alongside
  the existing ones): given a Link-type attachment with `url: "https://example.com/x"` or
  `url: "http://example.com/x"`, `href` resolves to that same URL unchanged; given
  `url: "javascript:alert(1)"`, `url: "JAVASCRIPT:alert(1)"` (case-insensitive), `url:
  "data:text/html,..."`, `url: "/relative/path"`, or `url: "not a url"` (malformed), `href`
  resolves to `undefined`; the File-type branch's `href` is unaffected by any of this (design.md
  Decision 15, Fix 6). Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/attachmentLink.test.ts` (failing — `href` is
  currently always a string, never `undefined`, and no scheme check exists yet).
- [x] 6e.14 Widen `AttachmentLink.href` to `string | undefined` and implement the allowlist per
  design.md Decision 15, Fix 6 (parse with `new URL(...)`, catch the thrown error for a relative
  or malformed string, accept only `http:`/`https:` protocols). Verify the 6e.13 tests pass, and
  run `yarn tsc` to confirm the now-widened `href` type doesn't break
  `AttachmentLinkCellContent`'s existing `<a href={link.href}>` usage (an `undefined` href simply
  omits the attribute — no code change expected there, but confirm, don't assume).

### Fix 7 — Shared "cozy" padding convention for `TableCell`/`TableColumn`

- [x] 6e.15 Write a failing test in `tests/unit/design-system/components/Table.test.tsx`'s existing
  suite (new cases): given `padding="cozy"` on a `TableCell`, its rendered inline `style` includes
  `padding: "0.5rem 0.75rem"` and `height: "auto"`; given `padding="cozy"` on a `TableColumn`, the
  same; given no `padding` prop (or `padding="token"`) on either, the rendered inline `style` is
  byte-identical to today's (the existing, unmodified assertions in this file already prove this
  for the default case — do not weaken them) (design.md Decision 15, Fix 7). Verify with `yarn
  vitest run tests/unit/design-system/components/Table.test.tsx` (failing — `padding` does not
  exist on either component's props yet).
- [x] 6e.16 Add `padding?: "token" | "cozy"` to `TableCellProps` and `TableColumnProps`
  (`TableCell.tsx`, `TableColumn.tsx`), implemented per design.md Decision 15, Fix 7 (a second
  style object, not a `className`, since an inline `style` cannot be beaten by a `className` and
  this app's own `.dts-table th/td` rule would beat a bare utility class anyway). Verify the 6e.15
  tests pass, and re-run the full `Table.test.tsx` file to confirm the existing `compact`-prop
  tests and the default-padding tests did not regress.
- [x] 6e.17 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Attachments
  Card" describe block asserting every `TableColumn`/`TableCell` in the Attachments table now
  renders `padding="cozy"`'s inline style (`padding: "0.5rem 0.75rem"`), not the `compact` token
  style. Verify failing.
- [x] 6e.18 In `HazardousEventAttachmentsCard.tsx`, replace every `compact` prop on its
  `TableColumn`/`TableCell` usages with `padding="cozy"`. Verify the 6e.17 test passes, and re-run
  the full `HazardousEventDetailPage.test.tsx` file to confirm no other Attachments assertion
  regressed.

### Fix 8 — Audit log table rebuild (own `Table`, Create/Update/Delete translation ported)

- [x] 6e.19 Write a failing unit test for a new `translateAuditLogAction.ts` in
  `app/domains/hazardous-events/presentation/web/translateAuditLogAction.test.ts`: given a fake `t`
  that returns a distinguishable, non-English-looking string per key (so the test can tell `t()`
  was actually called, not just echoing the input), `translateAuditLogAction("Create hazardous
  event", t)` calls `t("detail.audit_log.actions.create", { obj: t("detail.audit_log
  .object_hazardous_event") })` and returns its result; the same for `"Update hazardous event"`
  and `"Delete hazardous event"` (Decision 15, Fix 8 — included for symmetry with the existing
  regex even though no live write path produces this exact string today); any other string (e.g.
  `"Submit draft"`, `"Delete"`, `"delete"`) is returned unchanged, with `t` never called for the
  action itself (design.md Decision 15, Fix 8). Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/translateAuditLogAction.test.ts` (failing — the
  file does not exist yet).
- [x] 6e.20 Implement `translateAuditLogAction.ts` per design.md Decision 15, Fix 8. Verify the
  6e.19 test passes.
- [x] 6e.21 Add the new locale keys from design.md Decision 15, Fix 8's table
  (`detail.audit_log.columns.{action_taken,by,organisation,date,time}`,
  `detail.audit_log.actions.{create,update,delete}`, `detail.audit_log.object_hazardous_event`) to
  `locales/en/hazardous-events.json` and `locales/fr/hazardous-events.json`, reusing the legacy
  translation system's own `audit_log.*`/`hazardous_event` values verbatim (en/fr) per the
  table in design.md. **Amended by explicit user resolution (2026-11-18):** also add
  `detail.attachments_table.*` to `fr` — the gap this task originally deferred is fixed as part of
  this same round, reusing legacy's own established terms (`Fichier/URL` from
  `attachments.file_or_url`, `Tags` from `common.tags`), not the task's original draft wording.
- [x] 6e.22 Write a failing test in `HazardousEventDetailPage.test.tsx`'s existing "Audit log
  history Card" describe block: replace the inline fixture's English column-header strings
  (currently inherited from `AuditLogHistory`'s own `ctx.t` stub) with the new
  `detail.audit_log.columns.*` fixture entries (set each to the same English values so existing
  column-name assertions keep passing); add a new entry under `detail.audit_log.actions.*`/
  `object_hazardous_event` in the test's inline locale mirror, each set to a value distinguishable
  from the raw action string (e.g. `create: "CREATED: {{obj}}"`, `object_hazardous_event: "HE"`),
  so a new test can assert the rendered row for `action: "Create hazardous event"` shows the
  *translated* string, not the literal pass-through text, proving the new table calls
  `translateAuditLogAction` rather than rendering the raw DTO value (design.md Decision 15, Fix 8).
  Keep the existing "renders a humanized action string unchanged" test's fixture
  (`"Submit draft"`) passing unchanged — it must still render verbatim. Verify with `yarn vitest
  run app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing).
- [x] 6e.23 Write a failing test in the same describe block asserting the Audit log table's
  `TableColumn`/`TableCell` elements render `padding="cozy"`'s inline style (matching Fix 7,
  task 6e.17's Attachments assertion), and that the "Action taken" column is `isRowHeader`
  (mirroring the Attachments Title column's existing precedent). Verify failing.
- [x] 6e.24 Implement the rebuild in `HazardousEventAuditLogCard.tsx` per design.md Decision 15,
  Fix 8: remove the `AuditLogHistory` import; render a `Table` with 5 `TableColumn`s (Action taken,
  By, Organisation, Date, Time — labeled from the new `detail.audit_log.columns.*` keys, "Action
  taken" `isRowHeader`), one `TableRow` per `auditLog` entry, each cell using `padding="cozy"`;
  the Action-taken cell renders `translateAuditLogAction(entry.action, t)`; Date/Time render via
  the provisional default named in design.md Decision 15, Fix 8 — construct a `Date` from
  `entry.timestamp` and render `date.toDateString()`/`date.toTimeString()`, unchanged from today's
  output (**pending human confirmation — see design.md**, not a closed decision). Drop the
  now-unused `useViewContext` import/call if nothing else in this file needs `ctx`. Verify the
  6e.22 and 6e.23 tests pass, and re-run the full `HazardousEventDetailPage.test.tsx` file to
  confirm the existing "renders a 5-column table...", "renders newest-first order...", and empty-
  state tests in this describe block did not regress.
- [x] 6e.25 Correct the stale `AuditLogHistory`-dependency comments named in design.md Decision 15
  (no behavior change): `humanizeAuditAction.ts`'s doc comment, `HazardousEventDetailDto.ts`'s
  `auditLog` field doc comment, and `HazardousEventDetailPage.test.tsx:9`'s comment. Confirm via
  `git diff` that only comments changed in this task.

### Close-out

- [x] 6e.26 Confirm via repo-wide grep that `app/components/AuditLogHistory.tsx` has no remaining
  importer within the `hazardous-events` domain (DE/DR's own usages, if any, are out of scope and
  untouched).
- [x] 6e.27 Run `npx prettier --check` scoped to every file touched by this section (`Card.tsx`,
  `Card.test.tsx`, `TableCell.tsx`, `TableColumn.tsx`, `Table.test.tsx`,
  `HazardousEventDetailPage.tsx`, `HazardousEventDetailPage.test.tsx`,
  `HazardousEventLinkedEventsCard.tsx`, `HazardousEventAttachmentsCard.tsx`, `attachmentLink.ts`,
  `attachmentLink.test.ts`, the new `translateAuditLogAction.ts`/`.test.ts`,
  `HazardousEventAuditLogCard.tsx`, `humanizeAuditAction.ts`, `HazardousEventDetailDto.ts`, both
  locale files) — do not run a bare `yarn format` repo-wide.
- [x] 6e.28 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the updated
  `hazardous-event-detail-page` spec delta (the amended header-icon/title-size Requirement, the
  new Card-depth `## ADDED Requirement`, the two newly-added-to-this-delta `## MODIFIED
  Requirements` — Basic information/Hazard details field order, and Audit log history — and the
  amended Attachments/Linked-events Requirements) parses cleanly.
- [x] 6e.29 Present this round's two flagged-for-confirmation items (design.md Decision 15: Fix 1's
  header-to-content gap restoration, and Fix 8's Date/Time rendering choice) to the human
  explicitly, before Gate 9 (task 8.9) is re-run for this round, rather than letting Gate 9 be the
  first time either is raised. **Resolved (relayed by the coordinator, 2026-11-18):** both decided
  by the human in favor of the stated default before this round began — Fix 1 Part B accepted as
  specified, Fix 8 kept as-is. Not re-raised at Gate 9 below; both treated as closed.

## 6f. Card-to-Card gap and Card inner padding (sixth correction round, 2026-11-18)

Two further, narrow gaps already found and flagged by Decision 15's own Gate 9 pass (task 8.9,
"real, pre-existing structural-parity gaps found, flagged, not fixed") — resolved here, already
confirmed via source read and live screenshot by the orchestrator before this round's own
spec-writing pass, not re-derived (design.md Decision 16). Numbered "6f" rather than renumbering,
same practice as 6a/6b/6c/6d/6e.

### Fix 1 — Card-to-Card gap

- [x] 6f.1 Write a failing test in `HazardousEventDetailPage.test.tsx` asserting the six
  Card-rendering elements (the Basic information, Hazard details, and Location `<Card>` usages,
  plus `HazardousEventAttachmentsCard`/`HazardousEventLinkedEventsCard`/
  `HazardousEventAuditLogCard`) render inside one shared `<div class="space-y-6">` wrapper, distinct
  from the back-link's own separate `<div class="mb-4">` wrapper above it (design.md Decision 16,
  Fix 1). Verify with `yarn vitest run
  app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` (failing — no
  such wrapper exists yet).
- [x] 6f.2 In `HazardousEventDetailPage.tsx`, wrap the six Card-rendering elements in a new `<div
  className="space-y-6">`, placed immediately after the existing back-link `<div
  className="mb-4">` wrapper (not merged with it — that wrapper stays exactly as-is). Verify the
  6f.1 test passes.
- [x] 6f.3 Write a failing test in `tests/unit/design-system/components/Card.test.tsx` asserting
  `Card`'s own rendered `<section>` opening tag's `class` attribute does not contain `mb-4` —
  scoped to the root `<section>` tag specifically (e.g. by matching the opening tag at the start of
  the rendered output), not the icon-wrapper `<div>`'s own `mb-4`/`mb-6` from Decision 15 Fix 1,
  which is a separate element's class and is unaffected by this fix (design.md Decision 16, Fix 1's
  `mb-4`/`space-y-6` resolution). Verify with `yarn vitest run
  tests/unit/design-system/components/Card.test.tsx` (failing — `mb-4` is still present on
  `Card.tsx`'s `<section>` today).
- [x] 6f.4 Remove `mb-4` from `Card.tsx`'s `<section>` className (keep `rounded-2xl border
  border-gray-200 bg-white ... shadow-[...]` unchanged). Verify the 6f.3 test passes, and re-run the
  full `Card.test.tsx` and `HazardousEventDetailPage.test.tsx` files to confirm no existing
  assertion regressed — in particular, the icon-wrapper `mb-4`/`mb-6` tests from Decision 15 Fix 1
  and the back-link's own separate `mb-4`-wrapper test (task 6b.5), both of which assert a
  different element's class and must stay unaffected.

### Fix 2 — Card inner padding

- [x] 6f.5 Write a failing test in `tests/unit/design-system/components/Card.test.tsx` asserting
  `Card`'s rendered `<section>` className contains both `px-[20px]` and `py-[18px]`, and does not
  contain `p-5` (design.md Decision 16, Fix 2). Verify with `yarn vitest run
  tests/unit/design-system/components/Card.test.tsx` (failing).
- [x] 6f.6 In `Card.tsx`, replace `p-5` with `px-[20px] py-[18px]` on the `<section>` className.
  Verify the 6f.5 test passes, and re-run the full `Card.test.tsx` file to confirm no other
  assertion regressed.

### 6g. Correction to Fix 2's padding value (found by this round's own Gate 9 pass, task 8.9's
    6f entry; resolved 2026-11-18)

6f's own Gate 9 pass found that `.p-card-body`'s inline override is not legacy's only padding
layer — `.p-card-content` nests inside it with its own unconditional theme padding
(`padding: 1.25rem 0`, `lara-light-blue/theme.css:4457-4459`), and the two stack. The real
stacked total, confirmed live via `getBoundingClientRect` on record
`6dd4e2db-b429-4a95-ab4e-28309269edcd`, is ~20px horizontal / ~35.5-36px vertical — the opposite
asymmetry from `px-[20px] py-[18px]` (design.md Decision 16, 6g correction). User-confirmed
target value: `px-[20px] py-[36px]`.

- [x] 6g.1 Update the test added in 6f.5 (`tests/unit/design-system/components/Card.test.tsx`) to
  assert `py-[36px]` in place of `py-[18px]` (the `px-[20px]` assertion is unaffected — the
  horizontal value was already correct). Verify with `yarn vitest run
  tests/unit/design-system/components/Card.test.tsx` (failing — `Card.tsx` still renders
  `py-[18px]`).
- [x] 6g.2 In `Card.tsx`, replace `py-[18px]` with `py-[36px]` on the `<section>` className (`px-
  [20px]` stays unchanged). Verify the 6g.1 test passes, and re-run the full `Card.test.tsx` and
  `HazardousEventDetailPage.test.tsx` files to confirm no other assertion regressed.
- [x] 6g.3 Run `npx prettier --check` scoped to `Card.tsx` and `Card.test.tsx` — do not run a bare
  `yarn format` repo-wide.
- [x] 6g.4 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the change still
  parses cleanly after design.md's Decision 16 correction.

### Close-out

- [x] 6f.7 Run `npx prettier --check` scoped to every file touched by this section (`Card.tsx`,
  `Card.test.tsx`, `HazardousEventDetailPage.tsx`, `HazardousEventDetailPage.test.tsx`) — do not run
  a bare `yarn format` repo-wide.
- [x] 6f.8 Run `openspec validate ca-he-detail-page-rebuild --strict` and confirm the updated
  `hazardous-event-detail-page` spec delta (the new Card-to-Card spacing scenario and the new
  Card-padding `## ADDED Requirement`) parses cleanly.

## 7. `hazardous-event-view` spec correction (housekeeping, folded into this change)

- [ ] 7.1 After archiving this change (task 9.2), read the merged
  `openspec/specs/hazardous-event-view/spec.md` and confirm it now shows exactly one corrected
  "Linked Event Relationships" scenario with "Caused by"/"Causing" wording — not a duplicate of
  the old "Triggering (caused by)"/"Triggered (causing)" text alongside it (design.md Decision 9
  flags this as unverified-by-tooling since the base file predates the Requirement/Scenario
  convention). If duplicated, hand-fix by removing the stale copy only — the corrected content
  itself was already produced through the OpenSpec delta mechanism, not hand-authored from
  scratch.

## 8. Quality gates

> **RE-RUN REQUIRED:** Every gate below (8.1-8.9) was last run against sections 1-6 only, before
> section 6a's Edit/Add-cause link removal existed. Unticked here (even where the historical
> result is kept, for context) because the diff they must cover has changed again; re-run each
> against the full current diff (sections 1-6a) before archiving. Gate 9 (8.9) in particular must
> re-verify live that the nav chrome shows only the Back link, and that an `EditData` role on a
> `DRAFT` record sees neither the Edit nor the add-cause link. 8.10 was already unticked (never
> run) and stays that way until the implementer addresses it.
>
> **Further re-run required (2026-11-17, second correction round):** section 6b (the back-link
> text/button-style/spacing correction, design.md Decision 12) adds its own new diff on top of
> sections 1-6a. Every gate below must also cover section 6b's files
> (`BackLink.tsx`/`BackLink.test.tsx`, the `HazardousEventDetailPage.tsx`/`.test.tsx` back-link
> changes, both locale files) before archiving. Gate 9 (8.9) must additionally re-verify live that
> the back-link renders as the outlined-button control with "Back to Hazardous events" text and
> the corrected spacing to the Basic information Card — not just the nav-chrome absence checks
> from the 6a re-run.
>
> **Further re-run required (2026-11-18, third correction round):** section 6c (card header icons,
> field-grid spacing, Hazard details field labels, design.md Decision 13) adds its own new diff on
> top of sections 1-6b. Every gate below must also cover section 6c's files (`Card.tsx`/
> `Card.test.tsx`, the `HazardousEventDetailPage.tsx`/`.test.tsx` icon/grid/label changes,
> `HazardousEventAttachmentsCard.tsx`, `HazardousEventLinkedEventsCard.tsx`,
> `HazardousEventAuditLogCard.tsx`, both locale files) before archiving. Gate 9 (8.9) must
> additionally re-verify live that all six Cards render their matching header icon, that Basic
> information's and Hazard details' field grids show the wider legacy spacing, and that Hazard
> details' three field labels read "Hazard type"/"Hazard cluster"/"Specific hazard" — not just the
> 6a/6b checks from the prior re-runs.
>
> **Further re-run required (2026-11-18, fourth correction round):** section 6d (Specific-hazard
> grid placement, per-card content spacing, Linked events rebuild, Attachments tag pills and
> file-type icon/size, design.md Decision 14) adds its own new diff on top of sections 1-6c, and
> is itself a correction to a defect that a real screenshot comparison caught and the prior
> DOM/computed-style-only Gate 9 passes did not. Every gate below must also cover section 6d's
> files (`HazardousEventDetailPage.tsx`/`.test.tsx`, `HazardousEventLinkedEventsCard.tsx`,
> `HazardousEventAttachmentsCard.tsx`, `HazardousEventDetailDto.ts`/`.test.ts`,
> `GetHazardousEventById.ts`/`.test.ts`, the three new helper files and their tests, both locale
> files) before archiving. **Gate 9 (8.9) must this time be a real live-Chrome screenshot
> side-by-side against legacy (not a DOM/text/computed-style-only re-read, which is what missed
> this defect twice already)**, re-verifying: Specific hazard renders inside the first grid
> alongside Hazard type/Hazard cluster; Hazard details' and Location's multi-block spacing visibly
> matches legacy's own gaps; Linked events' cause/effect entries render as bordered cards with a
> visible subtitle and correct internal/between-group spacing; Attachments' tags render as pills
> and its File/URL column shows a type icon and, where known, a file size — not just the 6a/6b/6c
> checks from the prior re-runs.
>
> **Further re-run required (2026-11-18, fifth correction round):** section 6e (icon alignment,
> Card shadow, Record-status field order, Linked-events label wording, attachment link styling,
> shared "cozy" table padding, and the Audit log table rebuild, design.md Decision 15) adds its own
> new diff on top of sections 1-6d. Every gate below must also cover section 6e's files
> (`Card.tsx`/`Card.test.tsx`, `TableCell.tsx`/`TableColumn.tsx`/`Table.test.tsx`,
> `HazardousEventDetailPage.tsx`/`.test.tsx`, `HazardousEventLinkedEventsCard.tsx`,
> `HazardousEventAttachmentsCard.tsx`, `attachmentLink.ts`/`.test.ts`, the new
> `translateAuditLogAction.ts`/`.test.ts`, `HazardousEventAuditLogCard.tsx`,
> `humanizeAuditAction.ts`, `HazardousEventDetailDto.ts`, both locale files) before archiving.
> **Gate 9 (8.9) must again be a real live-Chrome screenshot side-by-side against legacy** (the
> same standing requirement section 6d established, not relaxed back to DOM/computed-style-only),
> re-verifying: every Card header icon visibly aligns with its title text; every Card renders a
> visible shadow; Basic information's "Record status" row renders last, as its own final row, with
> the other seven fields back in legacy's exact grid cells; the "Caused by"/"Causing" labels render
> without a colon; attachment links render in blue with the correct hover state; the Attachments
> and Audit log tables both use the same, more spacious cell padding; and the Audit log table still
> renders 5 columns, still empty-states correctly, and still shows a translated Create/Update
> action rather than the raw English string — not just the 6a/6b/6c/6d checks from the prior
> re-runs. This same pass is also where task 6e.29's two flagged-for-confirmation items (Fix 1's
> header-to-content gap, Fix 8's Date/Time rendering) must be put to the human, not quietly left as
> this round's own default.
>
> **Further re-run required (2026-11-18, sixth correction round):** section 6f (Card-to-Card gap
> and Card inner padding, design.md Decision 16) adds its own new diff on top of sections 1-6e.
> Every gate below must also cover section 6f's files (`Card.tsx`/`Card.test.tsx`,
> `HazardousEventDetailPage.tsx`/`.test.tsx`) before archiving. **Gate 9 (8.9) must again be a real
> live-Chrome measurement against legacy** (the same standing requirement section 6d established
> and 6e restated, not relaxed back to DOM/computed-style-only), this time confirming that the two
> real, pre-existing structural-parity gaps 6e's own Gate 9 pass found and flagged — not fixed —
> (the "Card-to-card gap" and "Card inner padding" paragraph at the end of 8.9's 6e entry) are now
> actually closed, as measured on both CA's and legacy's rendering of the same record, not just
> re-derived from source numbers (source-derived numbers have already been wrong twice in this
> change, Decisions 12 and 14) — not just the 6a/6b/6c/6d/6e checks from the prior re-runs.
>
> **Further re-run required (2026-11-18, seventh correction round, "6g"):** section 6g corrects
> Fix 2's padding value (`py-[18px]` → `py-[36px]`), found wrong by 6f's own Gate 9 pass
> (design.md Decision 16's 6g correction). Same two files as 6f (`Card.tsx`/`Card.test.tsx`), no
> new files. Gate 9 (8.9) must re-verify live that the vertical gap between a Card's header and
> its content, and between content and the Card's bottom edge, now reads closer to legacy's real
> ~36px stacked total, not the ~18px value this round corrects.

- [x] 8.1 `yarn vitest run` across every test file touched in sections 1-6a — all green (Gate 1).
  Historical note (sections 1-5 only): all green. Re-run against sections 1-6e: all green
  (`app/domains/hazardous-events`, `tests/unit/design-system`, and every integration test file
  this change touches — 73 files, 1082 passed, 1 todo), both before and after the full-diff
  comment sweep.

  Re-run against sections 1-6f: `tests/unit/design-system/components/Card.test.tsx` and
  `app/domains/hazardous-events/presentation/web/HazardousEventDetailPage.test.tsx` — all green
  (82 passed), both before and after this round's own comment sweep (8.6 below).
- [x] 8.2 `yarn tsc` — zero TypeScript errors (Gate 2). Historical note (sections 1-5 only): zero
  errors. Re-run against sections 1-6e: zero errors (confirmed after the section-6e diff and again
  after the full-diff comment sweep).

  Re-run against sections 1-6f: zero errors.
- [x] 8.3 `npx prettier --check` scoped to every file touched in this change — Prettier clean
  (Gate 3; do not run a bare `yarn format` repo-wide). Historical note (sections 1-5 only): clean.
  Re-run against every section-6e file (`Card.tsx`/`.test.tsx`, `TableCell.tsx`, `TableColumn.tsx`,
  `Table.test.tsx`, `HazardousEventDetailPage.tsx`/`.test.tsx`, `HazardousEventLinkedEventsCard.tsx`,
  `HazardousEventAttachmentsCard.tsx`, `attachmentLink.ts`/`.test.ts`,
  `translateAuditLogAction.ts`/`.test.ts`, `HazardousEventAuditLogCard.tsx`,
  `humanizeAuditAction.ts`/`.test.ts`, both locale files): clean, both before and after the
  full-diff comment sweep (two files needed a `--write` pass after the sweep's comment edits —
  `TableCell.tsx` and `HazardousEventAuditLogCard.tsx` — re-checked clean afterward).

  Re-run against sections 1-6f's own files (`Card.tsx`/`.test.tsx`,
  `HazardousEventDetailPage.tsx`/`.test.tsx`): clean. One re-indentation slip in
  `HazardousEventDetailPage.tsx` (the `space-y-6` wrapper edit shifted one `formatDate(...)` call's
  wrap depth) caught by this check and hand-fixed, re-verified clean; re-checked clean again after
  this round's own comment sweep (8.6 below, two compactions in `Card.test.tsx`).
- [x] 8.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` (Gate 4).
  Historical note (sections 1-5 only): reviewed. Re-run against section 6e: no findings — no
  Drizzle/DB/auth/tenant-scoping code touched by any of the 8 fixes; no `any`/non-null-assertion
  introduced (grepped every touched file); `attachmentLink.ts`'s new `safeLinkHref` degrades to
  `undefined` rather than swallowing an error silently, consistent with the error-handling checks.

  Re-run against section 6f: no findings — the round's whole diff is two Tailwind className edits
  on `Card.tsx` plus a layout `<div>` wrapper and their tests; no DB/auth/tenant/i18n-string surface
  touched at all.
- [x] 8.5 SOLID review — invoke the `solid-reviewer` agent against the changed files (Gate 5).
  Raised one MEDIUM SRP finding (Attachments/Linked events/Audit log sections should be their own
  components); applied (see `HazardousEventAttachmentsCard.tsx`/`HazardousEventLinkedEventsCard.tsx`/
  `HazardousEventAuditLogCard.tsx`) — reported to the orchestrator as a cheap, fully-test-covered,
  no-behavior-change refactor rather than decided silently. Re-run against the full sections 1-6
  diff: no new findings; confirmed the prior extraction still holds and section 6's three fixes
  (specificHazardCode threading, ReviewField) don't introduce a new responsibility or DIP leak.
  Re-run against section 6e: one LOW DIP finding — `humanizeAuditAction.ts`'s broad
  `/^(Create|Update|Delete)\s/` regex and the new `translateAuditLogAction.ts`'s strict
  `/^(Create|Update|Delete) hazardous event$/` regex independently pattern-match the same
  write-side string shape across the application/presentation boundary; a future `"Create <other
  object>"` string would silently fall through both layers untranslated. Both today's write sites
  (`Create/UpdateHazardousEvent.ts`, `DeleteHazardousEvent.ts`) only ever produce the three strings
  both regexes already handle consistently, so this is inactive risk, not a live bug — reported to
  the user/coordinator rather than refactored unilaterally (would mean widening the DTO's `action`
  shape to a structured `{verb, raw}`, a design-level change outside this round's 8 approved
  fixes). Re-confirmed LOW by the Gate 8 code-review pass below. No other findings; the shared
  `titleSize`/`padding` prop additions on `Card.tsx`/`TableCell.tsx`/`TableColumn.tsx` are additive
  and backward-compatible (existing callers' default behavior confirmed byte-identical by their own
  pre-existing tests).

  Not re-run for 6f: coordinator latitude for this round's two-class-plus-wrapper diff — no new
  responsibility, abstraction, or dependency introduced that SRP/DIP review would have surface area
  to check (two Tailwind className edits on an existing component, a layout `<div>` on an existing
  page). Re-confirmed importer count for `Card.tsx` still exactly 4, all within this change, same
  as Decision 13/16 already state — no new caller to raise a DIP concern about.
- [x] 8.6 Documentation review — confirm comments explain WHY not WHAT, one full-diff sweep by a
  fresh subagent, not self-review (Gate 6). Three passes total: the initial full-diff sweep (8
  comments compacted); a smaller delta sweep after the Gate 8 fixes landed (new/changed comments
  in `leafletLoader.ts`, `HazardousEventLocationMap.tsx`, the grid/pill additions); then a final
  re-sweep applying the human user's own stricter rule (at most 2 lines, state the fact only,
  never a before/after narrative), including one follow-up round after a personal spot-check found
  3 remaining misses. Verified via `git diff`/re-read that only comments changed each time, then
  re-ran gate 3 on every file touched. Re-run against the section-6 diff by a fourth fresh
  subagent: one remaining 3-line comment in `HazardousEventDetailPage.test.tsx` compacted to 2;
  everything else already within the bar. Verified green + prettier-clean.

  Full-diff re-sweep for section 6e (2026-11-18), run this time without being blocked (the prior
  two attempts in an earlier round were blocked by the auto-mode classifier): 4 parallel fresh
  fork subagents (groups A-D) covering all 56 files this change has touched end to end, not just
  6e's own delta. Total: 61 comments compacted across 25 files, no non-comment code touched,
  comment delimiters verified balanced. Re-ran gate 1 (unaffected, comment-only) and gate 3
  (Prettier) after applying — both clean.

  Re-run for section 6f, scoped to this round's own 4 files (prior rounds' full-diff sweeps already
  covered everything earlier than 6f), via a fresh subagent: 2 compactions in `Card.test.tsx` (the
  two comments citing design.md Decision 16, each restating what its own test name/assertions
  already said — the collapse-risk rationale kept, the rest dropped); nothing in `Card.tsx` or
  `HazardousEventDetailPage.tsx`/`.test.tsx` needed changing. Verified by re-reading the edited
  lines directly; re-ran gate 1 (unaffected) and gate 3 (Prettier, scoped to the one edited file)
  after applying — both clean.
- [x] 8.7 Project-conventions review against `.github/copilot-instructions.md` (Gate 7). Re-run
  against section 6e: no deviations — no new `.server.ts` files misnamed, no migration/env-var
  changes, `npx prettier --check` scoped (never a bare `yarn format`), and the page's existing
  `react-i18next`/`t()` convention (not the legacy `ctx.t()` system) is unchanged, consistent with
  this whole change's already-established, documented choice.

  Re-run against section 6f (self-assessed, not a separate subagent pass — nothing in this round's
  diff creates surface for this gate to check): no new `.server.ts` file, no migration/env-var
  change, no new user-facing string, `npx prettier --check` scoped (never a bare `yarn format`).
- [x] 8.8 Code review — run `.github/skills/code-review/SKILL.md` in full via a fresh subagent
  (Gate 8). Findings: HIGH (no real lifecycle test coverage for `HazardousEventLocationMap`/
  `leafletLoader.ts`, since the original test only used `renderToString`, which never runs
  `useEffect`) — fixed with `HazardousEventLocationMap.dom.test.tsx` and
  `leafletLoader.dom.test.ts`, each verified red-then-green against its own fix. MEDIUM (uncleared
  `setTimeout` could call `invalidateSize()` on an already-removed map) — fixed with
  `clearTimeout`, also verified red-then-green. LOW (sequential effect resolution; no tenant filter
  on the causality table) — not acted on, both pre-existing/already-documented trade-offs (design.md
  Risks; the tracked cross-tenant-causality open question). LOW (`onload` with `window.L` still
  unset left `leafletPromise` permanently resolved) — fixed, same reset as `onerror`. NIT (a
  `GeoJsonGeometry` type alias for readability) — not acted on, cosmetic only.

  Re-run against the full sections 1-6 diff (fresh subagent, high effort): MEDIUM — legacy's
  National specification/Description/Chains explanation fields use `whitespace-pre-line`
  (preserves embedded newlines); neither the old flat page nor `ReviewField` carries this over, so
  a multi-paragraph value visually collapses to one line. This is a real spec gap (confirmed: the
  live `hazardous-event-detail-page` spec never mentions `whitespace-pre-line`, and design.md's own
  ground-truth capture names it once but never resolves it in a Decision) — reported to the
  orchestrator rather than fixed unilaterally, since it needs a spec delta first. **RESOLVED by
  section 6's Fix 4 (tasks 6.15-6.17, now complete) and design.md's Fix 4 addendum (2026-11-17):
  `ReviewField`'s new `preserveLineBreaks` prop, wired at the three affected call sites, both
  preserves embedded newlines (`whitespace-pre-line`) and matches legacy's lighter, non-bold
  styling (`leading-relaxed text-slate-700`, no `font-semibold`) for National specification,
  Description, and Chains explanation — the font-weight/color divergence this finding's own
  design.md note had left flagged-not-fixed is now also closed, same prop, same call sites. Tests
  green, `yarn tsc` clean, Prettier clean.**

  One cheap finding fixed directly (nitpick/style, no spec impact): LOW — uncommented `as unknown
  as typeof dr` cast in `DrizzleAuditLogAdapter.test.ts`, now has a one-line justification comment.

  Three findings reported, not acted on: LOW/NIT — `findEffectEdges` has no `ORDER BY`, so
  multiple "Causing" effects have no deterministic order; an `orderBy(asc(createdAt))` fix was
  attempted, then reverted after review — it was a production-contract change the implementer
  judged needed a human decision rather than a unilateral nitpick fix, and its own test was weak
  (same-transaction inserts tie on `createdAt`, so the test never actually went red against the
  unordered implementation). Cosmetic only; no spec requires an order. LOW — `IAuditLogPort
  .findByRecord` has no `tx` param (asymmetric with `record()`), which is why the cast above
  exists at all; a design question for the orchestrator, not a bug against design.md. NIT —
  `GetHazardousEventById`'s `findByRecord` call isn't parallelized with the independent
  causal-chain/taxonomy resolution (performance only, pre-existing from sections 1-3, consistent
  with the already-documented sequential-resolution trade-off above).

  Final-increment re-review (Fix 4's own diff, fresh subagent via code-review skill): one nit — a
  byte-identical duplicate test in `ReviewField.test.tsx`'s two describe blocks — fixed directly
  (removed the duplicate, kept the single assertion). No other findings; 4/4 tests still pass,
  Prettier clean.

  Re-run against section 6f via a fresh subagent (code-review skill, high effort): no findings in
  any category. Independently confirmed the `space-y-6` wrapper nesting (six Cards share one
  wrapper, back-link wrapper genuinely untouched/separate, DOM ends `</section></div></form>`),
  re-verified the "exactly 4 importers of `Card.tsx`, all within this change" claim via a fresh
  grep, confirmed the new `Card.test.tsx` assertions are scoped to the root `<section>` tag only
  (cannot collide with the unrelated icon-wrapper `mb-4`/`mb-6` from Decision 15), and confirmed
  design.md Decision 16's text matches the implementation with no deviation.
- [x] 8.9 Visual/UX parity review (Gate 9, mandatory — this change touches
  `app/domains/hazardous-events/presentation/web/`): re-compare the rebuilt page against design.md's
  ground-truth checklist item by item (Card order, field sets, empty-state copy, map behavior for
  the single-observation case, Attachments/Audit-log table columns, both "Caused by" and "Causing"
  entries, the hazard-code conditional format, and the stacked label/value field rendering) — not
  a legacy screenshot diff, since design.md Decision 7 sets content/structure parity (not
  PrimeReact-markup parity) as the bar. Historical note (sections 1-5 only, superseded by section
  6's fixes): confirmed live against the running dev server with a record seeded with a real
  audit-log history, one attachment, a real causal effect edge (created through CA's own write
  path), and a real spatial-footprint geojson fixture (inserted via a one-off Drizzle script,
  deleted after use) — see design.md Decision 7 Addendum 2 for the full item-by-item result (fixed:
  2-column grids for Basic information and Hazard details, colored Hazardous-event-status pill;
  flagged for a human call at that time: the missing hazard code in Specific hazard, legacy's
  differing empty-state copy, the inline-text vs. stacked-label field style — the first and third
  are now resolved by section 6/design.md Decision 10; the second (Location/Attachments empty-state
  copy) remains flagged, out of this change's resolved scope — see Decision 10's closing note).
  This re-run must re-verify all three section-6 fixes live, not just re-read the historical note.

  Re-verified live (record `0024793c-f6d3-455d-99a1-948d3e8fc59c`, tenant-matched to
  `test.admin@india.gov.in`, real Cholera/BI0204 taxonomy row, no fixture needed): Hazard field
  renders "Cholera (BI0204)" (Fix 1, confirmed via page text and raw HTML). Basic
  information/Hazard details fields render `ReviewField`'s exact markup (`<div class="space-y-1">`
  wrapping two `<p>`s with the literal Tailwind classes) — confirmed via `getComputedStyle` on a
  live label/value pair (11px/600/uppercase/slate-500 label, 14px/600/slate-800 value) and via
  `getBoundingClientRect` (space-y-1's ~4px label-to-value gap not overridden by `dts-form`'s own
  `p` margins). 2-column grids for Type/Cluster and Start/End date confirmed intact in the raw
  HTML. "Caused by: No cause recorded" / "Causing: No effects recorded" confirmed unchanged (Fix
  2). Location Card is unaffected by section 6 (no record in the dev DB has a spatial observation
  to visually re-check against, same pre-existing gap design.md already flagged; Location's own
  Vitest coverage already asserts the inline `Field` markup is unchanged there).

  Tooling note: `mcp__claude-in-chrome__computer`'s `screenshot`/`zoom` actions timed out
  (`Page.captureScreenshot`) on every attempt, including a fresh tab — a CDP-level failure in this
  environment, not a page issue (JS execution, page text, and computed-style reads all worked
  normally throughout). Worked around it with a one-off Playwright script
  (`chromium.launch()`/`page.screenshot({fullPage:true})`, logged in through the real `/en/user/
  login` form, deleted after use) to capture and `Read` both this record's CA page
  (`/en/he-preview/...`) and its legacy page (`/en/hazardous-event/...`) side by side — confirmed
  visually: "Cholera (BI0204)" renders identically on both; both show the same 6-Card order; both
  show the uppercase-micro-label-over-bold-value stacked field pattern. Also re-ran the
  `getComputedStyle`/`getBoundingClientRect` check (above) against legacy's own "Record originator"
  pair on the same record: 11px/600/uppercase label, 14px/600 value, identical `oklch(...)` colors,
  3.5px label-to-value gap — a byte-for-byte match with CA's `ReviewField` measurements, not just a
  visual approximation. Correction to the paragraph above: "no record in the dev DB has a spatial
  observation" was this change's original, time-of-writing observation (41 Draft records, spot
  checked) and was never re-verified for this re-run; read as "this specific record has none," not
  a current claim about the whole dev DB.

  **Re-run against section 6e (2026-11-18), live screenshots this time (CDP `Page.captureScreenshot`
  worked for most of this pass; it did time out once during a background `yarn test:run2` run and
  recovered once that CPU-heavy run finished — noted, not retried indefinitely):** both
  flagged-for-confirmation items (Decision 15 Fix 1 Part B, Fix 8's Date/Time choice) were already
  resolved by the human before this round began (relayed by the coordinator; recorded at task
  6e.29) — not re-raised here.

  Verified live on record `afa94a20-6f47-4a18-be6a-24a18963d346` (carries pre-existing fixture data
  from an earlier Gate 9 round — one Link-type attachment, one `hazardous_event_causality` "Causing"
  edge, 10 audit-log rows; not created during this round, and an initial DB query miscounted
  causality rows by checking the wrong table, `event_causality`, instead of CA's own
  `hazardous_event_causality` — corrected before relying on it):
  - Fix 1: header `<i>` visually centered against the title text on every Card, both title-size
    groups (Basic information/Hazard details at the tighter "sm" size, the other four at "lg");
    non-zero header-to-content gap on every Card (no flush-against-content regression).
  - Fix 2: a visible drop-shadow on every Card, confirmed by zoomed screenshot (the earlier
    perfectly-flat edge is gone), matching legacy's own PrimeReact `.p-card` shadow when compared
    side by side on the same record.
  - Fix 3: "Record status" renders last, beside "Updated at" (row 4, column 2) — confirmed live;
    the other seven fields sit in legacy's own grid cells.
  - Fix 4: "Caused by"/"Causing" render with no trailing colon, in the specified
    `text-[13px] font-semibold text-slate-700` styling (zoomed screenshot).
  - Fix 5: the Link-type attachment anchor renders in blue with the external-link icon
    (`text-sm font-medium text-blue-700`), confirmed by zoomed screenshot.
  - Fix 7: Attachments' and Audit log's rows render visually at the same, more spacious pitch —
    both tables share the identical `padding="cozy"` style object, so one confirms the other.
  - Fix 8: confirmed in **both languages** — English renders "Create hazardous event" (en's
    `"Create {{obj}}"` interpolated with `"hazardous event"` happens to equal the raw string, so
    this alone doesn't prove translation ran); switching to `/fr/` renders "Mise à jour événement
    dangereux" for the same "Update hazardous event" row and "Mesures prises"/"Par"/"L'heure" for
    the column headers — this does prove `translateAuditLogAction` actually calls `t()`, not a
    pass-through. The new `fr` `detail.attachments_table.*` keys also render live ("Titre"/"Tags"/
    "Fichier/URL"), confirming the French locale fix has no missing-key fallback. "Submit draft"
    stays untranslated in French by design (Decision 4's locale-agnostic humanizer fallback), not
    a bug.
  - Fix 6: not exercised live with an actual unsafe URL in this shared dev environment; relied on
    `attachmentLink.test.ts`'s 13 passing cases plus Gate 8/10's independent re-derivation of the
    WHATWG `new URL()` allowlist logic instead.

  **Two real, pre-existing structural-parity gaps found, flagged, not fixed** (neither is one of
  Decision 15's 8 fixes; both are human calls per the design-deviation rule):
  - **Card-to-card gap.** Source-confirmed: legacy wraps all six Cards in one outer
    `<div className="space-y-6">` (`HazardousEventReviewStep.tsx:498`, 21px); CA has no such
    wrapper and instead gives each `Card.tsx` its own `mb-4` (14px, unchanged by this round). A
    ~7px gap difference between Cards, present before this round and not touched by it.
  - **Card inner padding.** Legacy's `Card`'s body padding is an inline override,
    `pt={{ body: { style: { padding: "18px 20px" } } }}` (`HazardousEventReviewStep.tsx:502`),
    beating the PrimeReact theme's own `.p-card-body { padding: 1.25rem }`
    (`lara-light-blue/theme.css:4444-4446`). CA's `Card.tsx` uses a flat `p-5` (1.25rem = 17.5px at
    this app's real 14px root) on all four sides of a single `<section>`, no separate header/body
    padding zones. By the numbers these are nearly identical (18px vs 17.5px), but side-by-side
    screenshots of the same record showed a visibly larger gap above legacy's title than CA's —
    inconclusive from screenshots alone (JPEG scaling makes sub-5px reads unreliable, and per
    project convention `getComputedStyle` pixel reads aren't trusted as ground truth either);
    flagged for a human visual check rather than asserting a specific cause.

  **Attachments/Linked events could not be compared side by side on a shared record.** Legacy's own
  page for `afa94a20...` renders "No attachments selected" and "No linked hazardous or disaster
  events selected yet" for this exact record — legacy's attachment parser doesn't recognize CA's
  JSON shape (`type`/`fileKey` vs legacy's own `file_option`/nested `file`), and legacy's linked-
  events view reads the old `event_causality`/`eventRelationshipTable` model, never CA's own
  `hazardous_event_causality` table. Both are pre-existing, already-scoped-elsewhere gaps (see the
  new "Known issue" note below) — Fix 5/7's styling was confirmed on CA's own rendering plus the
  exact-class source comparison already in design.md Decision 14/15, not a live legacy-side
  comparison, since no record in the dev DB has attachment/causality data both systems can render.

  **Known issue found, not caused by this round — legacy-shaped attachments 422 on CA's detail
  page.** Any record whose `attachments` JSONB was written by the legacy form throws
  `HazardousEvent.validateAttachments`'s `ValidationError` on CA's own read path (confirmed on two
  records, `fab05dbb-...`/`2f310379-...`; renders as a 422 with a broken `[object Object]` error
  message — a separate, smaller bug in the error-boundary's own rendering, also not touched by this
  round). The throw site (`app/domains/hazardous-events/domain/HazardousEvent.ts`) predates section
  6e entirely and isn't one of its 8 touched files. This exact gap is already in scope elsewhere:
  `Ma`'s backfill (`hazardous-events-refactoring-roadmap.md`'s Phase M, "execution not started")
  explicitly includes "jsonb attachments → one hazardous_event_attachment row per array element,"
  owned by a parallel team member per this project's own standing note — not registered as a new
  deferred item here to avoid a near-duplicate.

  **Re-run against section 6f (2026-11-18), real live-Chrome measurement on both pages for record
  `6dd4e2db-b429-4a95-ab4e-28309269edcd`, not source-derived numbers:**
  - **Fix 1 (Card-to-Card gap) — confirmed closed.** CA: all 5 gaps between consecutive
    `<section>`s measure 21px (`getBoundingClientRect`); back-link-to-first-Card gap unchanged at
    14px; trailing gap after the last Card is ~0 (no leftover margin). Legacy: all 4 gaps between
    consecutive `.p-card` elements on the same record also measure 21px. Both pages agree; this
    fix is real, not just internally self-consistent.
  - **Fix 2 (Card inner padding) — NOT closed; design.md Decision 16's own source reading was
    incomplete, same category of miss as Decisions 12/14.** Live DOM inspection of legacy's
    `.p-card` on this record shows two stacked padding layers, not one: `.p-card-body`'s inline
    override (`padding: "18px 20px"`, the one Decision 16 cited) is nested inside `.p-card-content`,
    which carries its own, unconditional theme-default `padding: 1.25rem 0`
    (`lara-light-blue/theme.css:4456-4458`, confirmed in `build/client/assets/themes/lara-light-blue/
    theme.css` — `1.25rem` = `17.5px` at this app's real 14px root, top/bottom only, `0` left/right).
    These stack (not override each other), so legacy's real total rendered inset from the card's
    outer edge to its content is **~20.8px left/right** (0.8px border + 20px body padding + 0px
    content padding) but **~36.3px top/bottom** (0.8px border + 18px body padding + 17.5px content
    padding) — measured directly via `getBoundingClientRect` on the icon/title row relative to its
    `.p-card` ancestor, consistent across all 4 sampled Cards on this record. This is the inverse
    asymmetry from what Decision 16 Fix 2 implemented and this round's code now renders
    (`px-[20px] py-[18px]`, i.e. more horizontal than vertical) — legacy is actually **more vertical
    than horizontal** once the theme's own stacked `.p-card-content` padding is counted, not just
    the inline override alone. This also explains the "visibly larger gap above legacy's title than
    CA's" that 6e's own Gate 9 pass flagged and attributed to an inconclusive screenshot read
    (8.9's 6e entry above) — the real cause was this second, unaccounted-for padding layer, not a
    screenshot-scaling artifact. **Not fixed here** — this is a design-deviation-worthy correction
    to design.md Decision 16 itself (the exact pixel values, not just the asymmetry direction, are
    wrong), reported to the human/coordinator for a decision rather than amended unilaterally. The
    `Card-padding` `## ADDED Requirement` in the `hazardous-event-detail-page` spec delta is also
    affected (it does not state numeric values, but the scenario's intent — matching legacy's own
    non-uniform padding — is unmet by the current numbers) and should be revisited alongside
    design.md once the human decides how to proceed (e.g. a `py-[36px]`-equivalent value, or
    re-deriving both axes from the stacked total, or a different resolution entirely).
- [x] 8.10 Independent second-opinion review — Claude Code's built-in `/code-review` at `high`
  effort via a second, separate fresh subagent; resolve findings before archiving (Gate 10). Left
  unticked: only one `code-review` skill is available in this session (the project one, already
  run as Gate 8) — no distinct built-in review could be invoked separately. Ran the `security-review`
  skill via a fresh subagent as a partial substitute instead (no high/critical findings; one
  informational note — the unpkg.com Leaflet load has no Subresource Integrity hash, matching
  legacy's own pre-existing pattern, not a new regression). Re-run (or re-confirm applicability)
  against section 6's diff too.

  Re-run against the section-6 diff, scoped to this change's own ~35-file `git status` list (not
  the branch's full history against main) via a fresh subagent: no high-confidence findings.
  Confirmed parameterized queries throughout (`findByRecord`, `findEffectEdges`,
  `DrizzleSpecificHazardTaxonomyRepository`), tenant scoping preserved on the new audit-log read
  and effect-edge resolution, no `dangerouslySetInnerHTML` in any new component. Still no distinct
  built-in `/code-review` available in this session, same as the historical note above.

  Re-run against section 6e via a fresh subagent (`security-review` skill, same substitute as
  above — still no distinct built-in `/code-review` in this session): no HIGH/MEDIUM findings.
  Independently re-derived that `attachmentLink.ts`'s `safeLinkHref()` closes the scheme-allowlist
  gap by delegating entirely to the WHATWG `new URL()` parser (case variants, protocol-relative
  `//`, embedded control characters, and whitespace tricks are all normalized or rejected before
  the protocol check runs — no regex-evasion window). No `dangerouslySetInnerHTML`/`eval` in scope;
  the Audit log rebuild renders `entry.action`/`entry.actorName` as plain JSX (React auto-escapes).

  Not re-run for section 6f: coordinator latitude for this round's diff — two Tailwind className
  edits plus a layout `<div>` wrapper introduce no new security-relevant surface (no new URL
  handling, no new DB query, no new user input path) for an independent second-opinion pass to
  check beyond what Gate 8 (8.8) above already covered for this round.

## 9. Regression and archive

- [x] 9.1 `yarn test:run2` (full PGlite suite) passes with no new failures; any pre-existing
  failure is confirmed pre-existing by running the same suite on the base branch first, not
  assumed (per project convention — no guessing). Re-run required: section 6 adds new test files
  and changed production files, so the historical result below (sections 1-5 only) does not cover
  the current diff. Historical note (sections 1-5 only): baseline (`git worktree` at HEAD
  6a227183) 4 failed files / 12 failed tests / 186 passed (190 total); branch (as of that run) same
  4 failed files / 12 failed tests / 190 passed (194 total) — all 4 failures
  (`UnifiedSinglePortServer.test.ts`, `HttpServerBootstrap.test.ts`,
  `countryAccountService.clone.test.ts`, `settingsService.languagePersistence.test.ts`) confirmed
  pre-existing, unrelated to this change (NestJS bootstrap API mismatch, a slow-service timeout, a
  settings-validation assertion).

  Re-run against the full sections 1-6 diff: `HEAD` is still `6a227183` (same baseline commit, no
  rebuild needed per the prior baseline's own validity). Result: 3 failed files / 11 failed tests /
  193 passed (196 total); 2535 passed / 11 failed / 3 skipped / 1 todo (2550 total) individual
  tests. All 3 failing files (`UnifiedSinglePortServer.test.ts`, `HttpServerBootstrap.test.ts` — 9
  tests, `settingsService.languagePersistence.test.ts`) are a subset of the 4 already-confirmed
  pre-existing failures above, compared by name, not count. `countryAccountService.clone.test.ts`
  did not fail this run — consistent with its documented cause (a slow-service timeout, i.e.
  flaky/timing-dependent), not evidence of a fix or a regression either way. No new failures
  introduced by section 6.

  Re-run against the final diff (Fix 4, tasks 6.15-6.17 complete, before the orchestrator's own
  post-hoc dedup of one `ReviewField.test.tsx` test — see 8.8 — so the live count is 2537/2552):
  3 failed files / 11 failed tests / 193 passed (196 total); 2538 passed / 11 failed / 3 skipped /
  1 todo (2553 total) individual tests — 3 more passing tests than the prior run, matching the new
  `ReviewField`/
  `HazardousEventDetailPage` tests this Fix 4 diff added. Same 3 failing files by name
  (`HttpServerBootstrap.test.ts`, `settingsService.languagePersistence.test.ts`, and this run
  `UnifiedSinglePortServer.test.ts` — the flaky slow-service timeout surfaced on a different file
  than last run's `countryAccountService.clone.test.ts`, consistent with its documented
  timing-dependent cause under heavy local load, not a new failure). No regression from Fix 4.

  Re-run against sections 1-6d (2026-11-18, section 6d close-out): raw 4 failed files / 12 failed
  tests / 257 passed (261 files); 2962 passed / 12 failed / 3 skipped / 1 todo (2978 total)
  individual tests. The 261/2978 raw totals are inflated by stale `.stryker-tmp/` sandbox copies
  (four sandboxes left over from this round's own aborted mutation-testing attempts carry a full
  repo copy each, and the root `vitest.config.ts` dom project's unanchored
  `**/*.dom.test.{ts,tsx}` glob runs with `dot: true`, so it collects their copies of the 15
  `*.dom.test.tsx` files too -- not separable from the raw numbers without a config change, which
  is out of this round's scope); none of the sandbox copies appear in the failing-test list, so
  this does not affect attribution. All 4 failing files match by name, exactly, the 4 files
  confirmed pre-existing against the `6a227183` baseline above (`UnifiedSinglePortServer.test.ts`,
  `HttpServerBootstrap.test.ts` -- 10 tests this run, `countryAccountService.clone.test.ts`,
  `settingsService.languagePersistence.test.ts`). No new failing file, no failure in any file
  touched by this change. No unhandled-error/rejection section reported. Recommend (user's call,
  not actioned here): clear `.stryker-tmp/` or add `"**/.stryker-tmp/**"` to the dom project's
  `exclude` in `vitest.config.ts` to stop the inflated file count recurring.

  Re-run against sections 1-6e (2026-11-18): 3 failed files / 11 failed tests / 199 passed (202
  files); 2618 passed / 11 failed / 3 skipped / 1 todo (2633 total) individual tests. `HEAD` is
  still `6a227183` (same baseline as every prior round — no rebuild needed, per the established
  precedent). The 3 failing files by name: `HttpServerBootstrap.test.ts`, `UnifiedSinglePortServer
  .test.ts` (re-ran individually to confirm — `countryAccountService.clone.test.ts` passed this
  time instead, consistent with its documented timing-dependent flakiness), and
  `settingsService.languagePersistence.test.ts` — all 3 are members of the same 4-file baseline
  confirmed pre-existing against `6a227183` in every prior round. No new failing file, no failure
  in any file section 6e touched. No regression.

  Re-run against sections 1-6f (2026-11-18, section 6f close-out). `HEAD` is still `6a227183`
  (same baseline as every prior round). First attempt, run concurrently with a live-Chrome
  session, two fresh-subagent reviews, and this round's own comment-sweep subagent all active at
  once: 4 failed files / 12 failed tests / 198 passed (202); the 3 baseline files by name
  (`HttpServerBootstrap.test.ts`, `UnifiedSinglePortServer.test.ts`,
  `settingsService.languagePersistence.test.ts`) plus one not in the baseline set —
  `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts`'s own
  "QUIRK: silently truncates at 200" test, a hard 5000ms timeout around 201 sequential Drizzle
  inserts, timed out at 5267ms. Not accepted as a regression finding on that run alone (per
  project convention — no guessing from one noisy run): re-ran the full suite a second time with
  nothing else active — 3 failed files / 11 failed tests / 199 passed (202); 2621 passed / 11
  failed / 3 skipped / 1 todo (2636 total) individual tests; the boundary test passed this time,
  and the other 3 failing files match the established baseline set by name exactly (same pattern
  as every prior round — `UnifiedSinglePortServer.test.ts` surfaced this run,
  `countryAccountService.clone.test.ts` did not, consistent with its documented timing-dependent
  flakiness). Then ran the boundary test alone a third time, fully isolated (checked via
  `tasklist` for stray `node.exe` processes first — none beyond the dev server): passed cleanly
  (54.5s total, test itself ~2.8s). Structurally confirmed unrelated to this round's diff: its
  import graph (`~/db/queries/hazardousEventRepository`, `~/db/queries/eventCausalityRepository`,
  DB setup/helpers) contains no file section 6f touched, and it also passed in the 6e-round full
  run recorded above. Conclusion: a pre-existing, timing-marginal test (5267ms against a 5000ms
  limit is not slack) that surfaces only under heavy concurrent system load, not a regression
  introduced by section 6f — flagged to the user as newly observed, since deciding whether to
  raise its timeout is their call, not actioned here. No unhandled-rejection/error section in
  either run's output (the `ERROR`-level pino log lines present — "Unhandled error in
  hazardous-event list/detail loader", "DB connection lost" — are deliberate error-path test
  fixtures, not real unhandled rejections; confirmed by reading their surrounding log context).
  No new failing file beyond the one addressed above, no failure in any file section 6f touched.
  No regression.
- [ ] 9.2 Run `opsx:archive` for this change on the same branch (`feature/ca-shared-audit-log`)
  before raising the Phase 6 PR, per the roadmap's explicit instruction to raise that PR only once
  the audit log is fully visible on CA's page. Then complete task 7.1's post-archive spec check.
