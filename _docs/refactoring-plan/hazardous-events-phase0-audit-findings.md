# Hazardous Events Phase 0 — Audit Findings

Companion to `hazardous-events-refactoring-roadmap.md` (Phase 0, sub-tracks 0a–0g). Written as a
sibling doc rather than appended directly to the roadmap so this branch
(`feature/ca-he-behavior-audit`) stays independently mergeable without needing
`feature/ca-hazardous-events-scaffold` merged in first — see 0g for how this gets folded back
into the roadmap once all sub-tracks land on `dev`.

Each section corresponds to one Phase 0 sub-track and its characterization test file.

---

## Cross-cutting: `app/backend.server/models/event/` is entirely dead code

**Discovered while starting 0d, corrected 0a–0c retroactively before continuing.** All HE
characterization tests originally targeted `app/backend.server/models/event/*.ts` (the
post-`ecc7e471`-refactor split files). Confirmed via `tsc --traceResolution` — not assumed —
that **every real HE entry point** (UI: edit, delete, detail/view, csv-import, the create route;
API: add, update, upsert; `hazardousEventService.ts`; `hazardeventform.tsx`) imports via
`~/backend.server/models/event`, which resolves to the **file** `app/backend.server/models/event.ts`
(2441 lines), never the **directory** `event/index.ts` — standard Node/bundler resolution: an
exact file match wins over a directory index. A repo-wide grep for imports of the split files by
their specific paths (`models/event/hazardous_event_create_update`, `.../cycles`, `.../temporal`,
`.../validation_workflow`, `.../attachments`) returns zero results anywhere.

`event.ts` was never deleted after the split (`ecc7e471 refactor: split large event.ts file into
multiple smaller files`) and has kept receiving real fixes since (`1d676b6e`, `7df256e9`), so it
has diverged from the orphaned copy — see 0a below for the specific differences found.

**Recommendation, not acted on now (per your instruction):** delete `app/backend.server/models/event/`
entirely as a post-refactor cleanup activity, once the new domain module replaces `event.ts`
itself. Deleting it earlier risks nothing functionally (it's unreachable), but do it as a
deliberate, reviewed cleanup commit, not a side effect of something else.

---

## Cross-cutting: `apiAuth`'s not-found guard is dead code (discovered during 0e)

**Not HE-specific — `apiAuth` (`app/backend.server/models/api_key.ts`) gates every API-key route
across every domain**, so this affects Disaster Events/Records' API routes identically, not just
HE's. Recorded here because 0e's own API-route E2E testing is what surfaced it.

`apiAuth` does `const key = await ApiKeyRepository.getBySecret(authToken); if (!key) throw 401;` —
but `getBySecret` is a Drizzle `.select()`, which always returns an **array**, never `null`/
`undefined`. `![]` evaluates to `false` (empty arrays are truthy in JS), so this guard can never
fire for a genuinely-not-found key. Execution falls through to `return key[0]`, which is
`undefined` for zero matches — and every caller (`add.ts`, `update.ts`, `upsert.ts`, `list.ts`,
`fields.ts`) immediately does `apiKey.countryAccountsId`, throwing an unhandled `TypeError`
instead of returning a clean 401.

**The _missing_-header case is unaffected** — `if (!authToken) throw 401` above it correctly
catches a request with no `X-Auth` header at all, using a string/`null` check that behaves as
intended. The bug only manifests when a header is present but doesn't match any `api_key.secret`
row — a wrong or revoked key, not a missing one.

**Confirmed via E2E, empirically, not inferred**: hit `add.ts` with a freshly-inserted, valid API
key — reproduced the exact crash at `add.ts:24` (`apiKey.countryAccountsId` on `undefined`),
matching the code read exactly. After that request, the dev server was no longer listening on its
port and all subsequent requests failed to connect — this is an empirical observation from one
incident, not a categorical claim that every unhandled exception here always takes the process
down; no global `uncaughtException`/error-boundary handling was found for this dev server
(`react-router dev`), so an unhandled rejection reaching Node's default handler is a plausible
mechanism, but the process-death claim itself should be re-verified before being treated as a
certainty in Phase 2+ design. The API-route E2E harness proved too unstable in this environment to
push further today (see 0e below) — the rest of 0e's API-route characterization was done at the
PGlite layer instead, calling `jsonCreate`/`jsonUpdate`/`jsonUpsert` directly.

---

## 0a — Core CRUD

**Test file:** `tests/integration/db/models/hazardousEventCoreCrud.test.ts` (31 tests, all green)
— redone against `event.ts` after the dead-code discovery above; originally 27 tests against the
orphaned split file, ported forward plus 4 new ones for guards `event.ts` has that the split file
didn't (see below).

### Differences found between `event.ts` (live) and the orphaned split file

- **`event.ts`'s `hazardousEventCreate`/`Update` unconditionally sync spatial-footprint data**
  (delete-then-recreate `hazardous_event_geom`/`hazardous_event_division` rows) on every save,
  via a private `syncHazardousEventSpatialFootprint` — entirely absent from the split file. This
  is real behavior squarely in 0d's scope, discovered here because it blocked 0a's tests from
  running at all (see the PostGIS test-infra section below).
- **`hazardousEventUpdate`/`hazardousEventUpdateByIdAndCountryAccountsId` gained two guards the
  split file never had**: `ErrParentNotFound` and `ErrCrossTenantReference` checks when setting a
  parent on _update_ (the split file only checked parent existence/tenant on _create_). This is
  the live implementation being more complete than what was originally characterized — added as
  4 new tests, all confirming the guards fire correctly.
- **`hazardousEventDelete` and all five `hazardousEventUpdateApprovalStatus*` functions are
  byte-identical** between `event.ts` and the orphaned split file — so findings 6–8 below (both
  delete bugs) are confirmed to affect the actual live code, not dead code as first written.
- The orphaned split file's "submit for validation" `tempAction` branch (calling
  `processValidationAssignmentWorkflow`) has **no equivalent inside `event.ts`'s create/update at
  all** — the live system handles "submit for validation" as a separate post-save step (see 0c's
  update below).

### PostGIS test infrastructure — fixed permanently, no real DB involved

`event.ts`'s unconditional spatial-footprint sync touches `hazardous_event_geom`, a real
PostGIS `geometry(Geometry,4326)` column — the installed PGlite build had no PostGIS support at
all (`type "geometry" does not exist`), and this is a genuine missing DB _capability_ in the test
environment, not just a missing table. Storage is native PostGIS geometry (WKB), not raw GeoJSON
— GeoJSON only exists at the application/API boundary (`ST_GeomFromGeoJSON` in,
`ST_AsGeoJSON` out) — so approximating the column as plain text would have silently stopped
verifying geometry validity/SRID handling.

Fixed durably, keeping the "no real DB" constraint intact:

- Added `@electric-sql/pglite-postgis` (official PostGIS extension for PGlite, WASM, in-memory,
  zero external services) as a devDependency.
- Upgraded `@electric-sql/pglite` `0.4.4 → 0.5.8` to match its peer requirement — verified via a
  smoke test (`ST_GeomFromGeoJSON` → `ST_MakeValid` → store → `ST_AsGeoJSON` round-trips exactly)
  and a full `yarn test:run2` run (512/513 passing, only the already-confirmed pre-existing
  `entityValidationAssignmentRepository.test.ts` failure remains — no regressions from the
  version bump).
- Wired `postgis` into `tests/integration/db/setup.ts`'s `PGlite` instance +
  `CREATE EXTENSION IF NOT EXISTS postgis;`, and passed `extensionsFilters: ["postgis"]` to
  `pushSchema` (a first-class drizzle-kit option) to exclude PostGIS's own catalog tables
  (`spatial_ref_sys` etc.) from the schema diff — without this, `pushSchema` hangs trying to
  interactively ask "is this a rename?" in a non-interactive test run.
- Added `hazardousEventGeomTable`/`hazardousEventDivisionTable` to the PGlite test schema
  (previously missing entirely — another P1-42 instance).

This is a shared fix (`setup.ts` is used by every PGlite test file), so it also unblocks 0d, and
any future test needing real geometry columns, permanently — not a per-track workaround.

### Confirmed quirks (preserve as-is unless explicitly decided otherwise)

1. **HIP hierarchy validation only fires on a _partial_ hierarchy, not a missing one.**
   `getRequiredAndSetToNullHipFields` returns no error at all when `hipHazardId`/`hipClusterId`/
   `hipTypeId` are all unset — it only errors when hazard is set without cluster, or cluster is
   set without type. An event with zero HIP classification passes this check entirely (HIP
   completeness, if required at all, must be enforced elsewhere).
   **Correction (found during 0e):** this is true of `validate()` in isolation, but
   **unreachable through `hazardousEventCreate`/`Update` in practice** — `hip_type_id` is a
   `NOT NULL` column at the DB level (`hipRelationColumnsRequired()`), so a real create/update
   with no HIP set at all fails on a database constraint before this ever matters, confirmed via a
   diagnostic insert. `validate()`'s own permissiveness here is real but currently masked by the
   schema.
2. **The partial-hierarchy error is always attached to the `hipHazardId` field key**, even when
   the actual problem is a missing `hipTypeId` (cluster set, type missing). A form/API consumer
   reading `errors.fields.hipClusterId` or `errors.fields.hipTypeId` for that case would see
   nothing.
3. **Cycle detection is capped at recursion depth 10** (`array_length(cc.path, 1) < 10` in
   `checkForCycle`'s recursive CTE) — a legitimate causal chain longer than 10 hops would not be
   fully walked; whether this can be reached in practice with real data was not evaluated here.
4. **Temporal-order validation only blocks when _both_ the proposed parent and child have a
   `startDate` set.** An event with no start date can be assigned any parent/child regardless of
   the other event's timeline.
5. **`hazardousEventUpdate`/`hazardousEventUpdateByIdAndCountryAccountsId` replace the parent
   link wholesale**, not merge: setting a new parent deletes the prior `event_relationship` row
   first, and setting `parent: null` clears it with no replacement — confirmed via direct
   assertion, not inferred.

### Real bugs found (not fixed — flagged for an explicit decision, per Invariant 1)

6. **Dead code: the reactive FK-violation catch in `hazardous_event_delete.ts` never fires.**
   It checks `error?.code === "23503"`, but Drizzle's query wrapper nests the actual driver
   error under `.cause` (`error.code` is `undefined`; `error.cause.code` is `"23503"`) —
   confirmed via a diagnostic run against a real PGlite/Postgres FK violation, not assumed. This
   means the intended friendly message ("Delete events that are caused by this event first")
   never reaches the user; instead a raw Drizzle "Failed query" error propagates uncaught. Data
   integrity is unaffected (the transaction still rolls back correctly) — this is a UX/error-
   handling bug, not a data-safety one. Note `app/routes/$lang+/api+/division+/delete_all.ts`
   independently defends against a _similarly-shaped but not identical_ nested-cause problem
   (checking `error?.details?.cause?.code`, a different path than what this bug needs) —
   suggesting this class of error-wrapping mistake isn't isolated to this one file.
7. **Passing `""` (empty string) instead of `null` for `createdByUserId`/`updatedByUserId`/etc.
   crashes with a raw Postgres UUID-parse error (`22P02`)**, not a graceful validation error —
   `hazardousEventCreate`/`Update` spread these fields directly into the insert/update with no
   sanitization. `HazardousEventFields` types these as non-nullable `string`, which doesn't
   reflect this reality.
8. **A real, exploitable gap in the delete dependent-check, not just a UX bug**: `hazardous_event_delete.ts`'s
   pre-check only queries `disasterEventTable.hazardousEventId` (the single primary-trigger FK).
   It does **not** check `event_causality` (the newer mechanism backing Disaster Event's "linked
   triggering/triggered hazardous events" feature). Deleting a hazardous event that is _only_
   referenced via `event_causality` succeeds silently — the `onDelete: cascade` on that table's
   FK columns removes the causality link with no warning, no block, and no trace. A user who
   carefully linked a hazardous event to several disaster events via that feature can lose all of
   those links by deleting the hazardous event through a completely different, unrelated flow.
   Confirmed via a dedicated characterization test (`QUIRK: is NOT blocked when only linked via
event_causality`).

### Test/prod schema drift fixed (P1-42, blocking these tests otherwise)

`tests/integration/db/testSchema/` was out of sync with production in four ways, all fixed as
part of this track since accurate characterization tests require an accurate test schema:

- `hazardousEventTable`: had an extra `spatialFootprint` column not in production; was missing
  the `hipClusterId`/`hipTypeId` entries in `hazardousEventTableConstraits`.
- `disasterEventTable`: missing the entire `approvalWorkflowFields` spread (`created_by_user_id`,
  `updated_by_user_id`, `submitted_by_user_id`, etc.), missing `recording_organization_id`,
  missing `startDateTime`/`endDateTime`, and had a stale `spatialFootprint` column production no
  longer has.
- `eventCausalityTable` didn't exist in the test schema at all — added, mirroring production
  exactly (including both CHECK constraints).

---

## 0b — Causal chain

**Test file:** `tests/integration/db/models/hazardousEventCausalChain.test.ts` (9 tests, all
green) — redone against `event.ts` after the dead-code discovery. This track only ever exercises
`checkForCycle`/`validateTemporalCausality` indirectly through `hazardousEventUpdate`/`Create`
(never imported directly), and those two functions are inlined in `event.ts` with the exact same
recursive CTE, depth-10 cap, and date-normalization logic as the orphaned split file — so the
redo was a pure import-path fix, no test content changes needed. **The depth-cap cycle-detection
bug (finding 1 below) is confirmed against the actual live code**, not dead code as first written
— this is now a stronger finding than originally recorded, not a weaker one. Shared seed helpers
extracted from 0a into `hazardousEventTestHelpers.ts` (0a updated to import from it, no behavior
change — re-verified green after the extraction).

### Real bug found — confirmed empirically, not inferred from reading the code

1. **Cycle detection has a hard blind spot beyond its recursion cap, and a genuine cycle gets
   silently persisted.** `checkForCycle`'s recursive CTE stops walking a chain's ancestry once
   the accumulated path already has 10 elements. Built a 20-node `caused_by` chain and attempted
   to close a cycle across its full length (`chain[0]`'s parent set to `chain[19]`, the far end
   of its own descendant chain) — **the update succeeds**, and an actual cycle is written into
   `event_relationship`: `chain[0] → chain[1] → ... → chain[19] → chain[0]`. A shorter 8-node
   chain, well under the cap, is correctly rejected. This is a real data-integrity gap in the
   current system, not a hypothetical — it's directly relevant to the "event-relationship graph
   integrity" resilience driver named for the new schema (roadmap Phase 2, Section D: whether
   the new causality table gets a DB-level cycle-prevention constraint instead of this app-layer
   depth-capped check).

### Confirmed quirks

2. **Multi-hop (indirect) cycle detection works correctly for chains under the cap** — a 4-hop
   chain closing a cycle is correctly rejected with `ErrRelationCycle`, not just the trivial
   direct 2-node case already covered in 0a.
3. **Temporal comparison at exactly equal start dates is allowed** (`<=`, not `<`) — confirmed as
   a deliberate boundary, not accidentally permissive.
4. **Mixed date-granularity comparison normalizes month/year-only dates to the 1st of the
   period**, which is an optimistic approximation for the parent side: a parent dated only
   `"2020-06"` normalizes to `2020-06-01` and will pass against any child date in June or later,
   even though the parent's real (unknown, day-level) date could plausibly be later in the month
   than the child's. Not a bug relative to the code's own logic — it's an inherent property of
   comparing dates at mismatched precision — but worth naming explicitly since a redesigned
   schema/validation could choose a stricter (or looser) rule here.
5. **`hazardousEventCreate`'s parent-handling never runs cycle or temporal checks at all** — only
   parent-existence and same-tenant checks (already covered in 0a). This is correct and doesn't
   need porting as a bug: a brand-new event cannot already be an ancestor of anything, so no
   cycle is possible at creation time. Confirmed explicitly rather than assumed, since it's a
   real asymmetry with `hazardousEventUpdate`'s parent-handling that a naive port might
   "fix" unnecessarily.

---

## 0c — Approval / validation workflow

**Test file:** `tests/integration/db/models/hazardousEventApprovalWorkflow.test.ts` (6 tests, all
green).

### Architecture finding: three parallel mechanisms exist today, not one

This directly informs Phase 2/3's decision to build `app/domains/validation-workflow/` as a
shared module now rather than porting whatever HE currently has — there isn't one thing to port,
there are three, reachable from two different live pages:

1. **`processValidationAssignmentWorkflow`** (`validation_workflow.ts`) — **dead code**, part of
   the orphaned `event/` directory (see the cross-cutting section above). Its live functional
   twin is `handleSubmitForValidation`, a private function inside `approvalWorkflowService.ts`
   itself (not orphaned — always live) — same shape: assigns validators, moves
   `draft → waiting-for-validation`, emails validators. Reached via `handleApprovalWorkflowService`
   dispatching on the `"submit-validation"` action, not as a branch inside create/update the way
   the orphaned version was structured.
2. **`handleApprovalWorkflowService`** (`app/backend.server/services/approvalWorkflowService.ts`)
   — generic, `EntityType`-parameterized (includes `"hazardous_event"`). Handles
   validate/publish/reject/return by calling the `hazardous_event_approval.ts` functions
   directly. Wired to the **edit page** (`hazardous-event+/edit.$id.tsx`).
3. **`updateHazardousEventStatusService`** (`app/services/hazardousEventService.ts`) — a second,
   independent implementation of the same validate/publish/reject/return transitions, calling the
   same underlying `hazardous_event_approval.ts` functions but through a different orchestration
   layer (`dataCollectionService` → `processApprovalStatusActionService` in
   `approvalStatusWorkflowService.ts`, which also handles rejection comments and email
   notifications separately). Wired to the **detail/view page** (`hazardous-event+/$id.tsx`).

Both (2) and (3) are live, not dead code — confirmed by tracing actual route imports, not
assumed. They independently reimplement the same transitions for the same entity; this is
exactly the kind of drift risk that already bit the Disaster Event side (the "must have at least
one approved record" rule landed in the generic service and was separately hand-duplicated into
the entity-specific one — see the earlier "quick behaviour check" findings from this session,
before Phase 0 started). HE doesn't have an equivalent drift today, but the structural risk is
identical.

**Also dead code, small**: `hazardousEventUpdateApprovalStatus` (the generic one, distinct from
the four specific `...OnGoing`/`NeedRevision`/`Validate`/`Publish` variants) has no callers
anywhere in the app — confirmed via repo-wide grep — only its own commented-out import in
`hazardousEventService.ts`.

### Real bugs found

1. **Publishing silently overwrites the original validator's attribution — needs a product
   decision, not just a code fix; no schema change required.**
   `hazardousEventUpdateApprovalStatusPublish` sets `validatedByUserId`/`validatedAt` to the
   _publisher's_ identity and the publish timestamp — not the original validator's. If a
   different user validates than publishes (a normal workflow shape — validator hands off to a
   publisher), the record of who actually validated it, and when, is lost. Confirmed via a
   dedicated test asserting the validator's id is gone after publish.
   - **No DB/schema change needed** — `validatedByUserId`/`validatedAt` and
     `publishedByUserId`/`publishedAt` already exist as four separate columns; the bug is purely
     in the application code unconditionally overwriting the former with the latter's values.
   - **Also confirmed**: `submit-publish` has no state-transition guard requiring the record to
     already be `"validated"` — traced `approvalWorkflowService.ts`'s action dispatch, it's a
     flat switch with no prior-status check. So today's unconditional overwrite may be an
     (imperfect) safety net ensuring a published record never shows a null validator, not pure
     carelessness.
   - **Two different fixes depending on the product answer** (flagging for PM discussion, not
     deciding here): (a) if direct publish-without-validation should stay allowed, the fix is
     conditional — only backfill validated fields from the publisher when they're still null,
     preserve them otherwise; (b) if it shouldn't be allowed, the real fix is a state-transition
     guard requiring `approvalStatus === "validated"` before `submit-publish` is accepted — which
     doesn't exist today in either of the two live workflow paths (0c's architecture finding
     above), and would need to live somewhere both call through.
   - **Explicitly out of scope for now** — not being fixed as part of this refactor unless asked;
     recorded here for the PM conversation.
2. **The falsy-`submittedByUserId` "skip email" guard in `processValidationAssignmentWorkflow` is
   unreachable.** The function writes `submittedByUserId` unconditionally to the (UUID)
   `submitted_by_user_id` column _before_ the `if (submittedByUserId)` guard around the email
   call is even checked — so passing an empty string to intentionally skip the email crashes on
   the DB write first, with the same raw Postgres UUID-parse error as the 0a finding. The current
   single call site never triggers this in practice (an earlier guard already ensures a non-empty
   value reaches it), but the function has no such guarantee on its own if called elsewhere.

### Confirmed (non-bug) quirks

3. **`hazardousEventUpdateApprovalStatusNeedRevision` clears validated/published attribution but
   deliberately leaves `submittedByUserId`/`submittedAt` intact** — a revision request doesn't
   erase who originally submitted the record for validation.

---

## 0d — Attachments, HIP picker, spatial/division data

**Test file:**
`tests/integration/db/models/hazardousEventAttachmentsHipSpatial.test.ts` (13 tests, all green).
Covers `dataForHazardPicker`/`getRequiredAndSetToNullHipFields` (`hip_hazard_picker.ts`), the
`syncHazardousEventSpatialFootprint`/`loadHazardousEventSpatialFootprint` round-trip (private in
`event.ts`, reached indirectly via `hazardousEventCreate`/`Update`/`ById`), and
`processAndSaveAttachments`'s DB-write behavior with `ContentRepeaterUploadFile.save` mocked at
the module boundary (see the filesystem finding below for why).

### Test infrastructure: a second missing DB capability, fixed the same way as PostGIS

`dataForHazardPicker` and `hazardousEventBasicInfoById`'s hazard lookup both call
`dts_jsonb_localized(jsonb, lang)`, a Postgres function defined in a real migration
(`app/drizzle/migrations/20260129075114_sectors_db_funcs.sql`) rather than a table —
`pushSchema` only diffs/creates tables, so it was entirely absent from the PGlite test DB (no
prior test exercised it). Unlike PostGIS this is a trivial, self-contained, pure-SQL function
(`COALESCE(data->>lang, data->>'en', '')`, no extension/WASM cost), so it's created directly in
`tests/integration/db/setup.ts` via `client.exec(...)`, mirroring the migration's definition
exactly — a one-time, always-cheap addition, not per-track workaround.

Also required extending the shared `ctx` test double (`hazardousEventTestHelpers.ts`) with
`lang: "en"` — the real `BackendContext` always carries `.lang` (bootstrap-computed alongside
`.t`, see the `useViewContext .lang coupling` note), but the lightweight test double didn't need
it until this track's functions started reading it directly.

### Test/prod schema drift fixed (P1-42): `division`'s own `geom`/`bbox` columns were commented out

`tests/integration/db/testSchema/divisionTable.ts` had `geom`/`bbox` (real PostGIS geometry
columns, a GIST index each, and a `valid_geom_check` constraint) commented out with a note "for
PGlite compatibility" — a leftover from before this session added real PostGIS support in 0a.
Uncommented to match production exactly, now that the blocker no longer exists. HE's own read
path doesn't touch these columns (it reads `division.geojson`, a plain jsonb column already
present), so this was drift cleanup enabled by 0a's fix, not something blocking 0d's own tests.

### Real bugs found (not fixed — flagged for an explicit decision, per Invariant 1)

1. **Linking a hazardous event to a "Geographic level" division via `spatialFootprint` never
   checks the division belongs to the event's own tenant.** `syncHazardousEventSpatialFootprint`'s
   division-validity check is `where(inArray(divisionTable.id, divisionIds))` — no
   `countryAccountsId` filter at all, unlike `HazardousEventDivisionRepository.
getDivisionNamesByHazardousEventIds`, which does scope by tenant. Confirmed via a dedicated
   test: a division seeded under a completely different tenant links successfully with no error.
   This is the same class of gap 0a found on `parent` linkage before `ErrCrossTenantReference` was
   added there — this path has no equivalent guard today.
2. **The geographic-level display title always resolves to the English name, ignoring the
   caller's `ctx.lang`** — `nameObject?.en || Object.values(nameObject || {})[0] || division.id`
   in `loadHazardousEventSpatialFootprint`, unlike `dataForHazardPicker`'s HIP names (correctly
   localized via `dts_jsonb_localized(..., ctx.lang)`). A non-English user sees HIP labels in
   their language but division/geographic labels always in English.

### Confirmed quirks (preserve as-is unless explicitly decided otherwise)

3. **A "Geographic level" spatial-footprint item is never snapshotted.** Unlike "Map coordinates"
   items (stored as real geometry at save time), a geographic-level item stores only the
   `division_id` link — its displayed title/shape is re-resolved live from `division_table` on
   every read. Renaming or reshaping a division after linking it changes what every hazardous
   event linked to it displays, retroactively, with no record of what it looked like at link
   time. Directly relevant to the roadmap's open decision #8 (whether the new
   `hazardous_event_spatial_observation` model should snapshot or reference).
4. **`getRequiredAndSetToNullHipFields` mutates its input object in place** as a side effect of
   computing its return value — passing a fields object with only `hipHazardId` set causes
   `hipClusterId`/`hipTypeId` to be written onto that same object as `null`, not just reported as
   missing. Callers relying on the original object's shape after calling this function would see
   it silently changed.
5. **Re-syncing spatial footprint on update replaces it wholesale**, matching 0a's finding #5 for
   `parent`: a new footprint array fully replaces the old one (delete-then-recreate), never
   merges.

6. **`hazardousEventCreate` always performs real filesystem writes, with no injectable base
   path.** `hazardousEventCreate` (event.ts) calls `processAndSaveAttachments` whenever the
   insert succeeds (`if (res.length > 0)`), unconditionally — even when the caller supplies zero
   attachments (it passes `[]`). `processAndSaveAttachments` calls `ContentRepeaterUploadFile.save`
   (`app/components/ContentRepeater/UploadFile.tsx`, a component shared with Disaster Events and
   Disaster Records), which runs a real synchronous `fs.mkdirSync(finalDestDir, { recursive: true })`
   against `path.join(process.cwd())` — there is no parameter on the `hazardousEventCreate` →
   `processAndSaveAttachments` call path to redirect this elsewhere.

   **Confirmed not a recent regression** — checked via `git log -p -L` on both
   `processAndSaveAttachments` and its call site inside `hazardousEventCreate`: this exact
   unconditional-call pattern has been stable since at least October 2025. What actually happened:
   this Phase 0 audit is the first time anything has exercised the real `hazardousEventCreate()`
   against this local checkout's working directory, so the long-standing behavior only started
   leaving visible directories under `uploads/hazardous-event/{eventId}` once 0a's tests began
   (87 stray empty directories accumulated across 0a–0c's test runs, confirmed by directory
   timestamps matching 0a's first commit onward) — cleaned up as routine test-run housekeeping,
   not as a fix to the underlying behavior.

   This is relevant to the refactor for two reasons, not fixed here:
   - **Testability**: characterizing the real file-move logic (`ContentRepeaterUploadFile.save`)
     without polluting a real working directory isn't possible through `hazardousEventCreate`'s
     current call path — there's no injectable path parameter. 0d's tests mock
     `ContentRepeaterUploadFile.save` at the module boundary instead of exercising it for real.
   - **Resilience**: any real deployment's server process pays this same unconditional mkdir cost
     on every create, attachments or not — worth a mental note for Phase 2+, not a bug to fix
     under Phase 0's characterization-only rule.

   **Decision for the refactored implementation (not applied now):** (a) only create the
   attachment directory when an attachment actually exists — no mkdir on an empty/absent
   `attachments` array; (b) the destination path must be injectable by the caller, not hardcoded
   to `process.cwd()` — with a default path used when no override is given, and available as a
   fallback if writing to an injected path fails.

## 0e — Presentation + CSV/API

**Status:** in progress. Test tier decision: 0e's roadmap scope calls for Playwright E2E (real
local Postgres, per the existing `tests/e2e/` infra and Notices' own P1-8 precedent — confirmed
with you that the "no real DB" rule is scoped to Phase 0's model-layer tracks, 0a–0d, not this
tier). Sequencing, per your direction: the CSV cross-tenant bug family first (below), then the
rest of 0e's scope (API routes, presentation gaps in delete guards/parent-linking/approval
transitions, CSV export) as this same commit continues.

**Test file (CSV tenant-scoping):**
`tests/integration/db/models/hazardousEventCsvImportTenant.test.ts` (5 tests, all green) — tested
at the PGlite layer, not E2E: `csvCreate`/`csvUpdate`/`csvUpsert`
(`app/backend.server/handlers/form/form_csv.ts`) are plain functions over already-parsed CSV rows
and a session-derived `countryAccountsId` string — no browser/multipart-upload machinery is
actually exercised by this bug, so PGlite characterizes it precisely and far faster than a
browser round-trip would. A later, lighter E2E test will separately confirm the outer
request-lifecycle (login → real file upload → success message) still works end-to-end.

### Real bugs found — severe, confirmed via direct code trace + empirical test, not assumed

1. **CSV import's tenant-scoping for Hazardous Events is entirely broken by a function-signature
   mismatch between the generic CSV handler and `hazardousEventCreate`/`Update`.**
   `CreateActionArgs`/`CsvCreateArgs`/`CsvUpdateArgs` (the generic, cross-domain interfaces in
   `csv_import.ts`/`form_csv.ts`) declare `create`/`update` as taking a trailing
   `countryAccountsId` parameter derived from the uploader's own session
   (`getCountryAccountsIdFromSession`). But `hazardousEventCreate(ctx, tx, fields)` and
   `hazardousEventUpdate(ctx, tx, id, fields)` only accept 3/4 parameters — TypeScript's
   structural typing allows a function with _fewer_ parameters to satisfy a type expecting more
   (JS silently drops unused trailing arguments), so this compiles cleanly but the session-derived
   tenant **never reaches either function**. The only `countryAccountsId` that ends up mattering
   is whatever the CSV row itself supplies as a plain column (via `fieldsDefApi`'s
   `{ key: "countryAccountsId" }` field) — confirmed empirically, not just from reading the types.
   This is the opposite of the three JSON API routes (`add.ts`/`update.ts`/`upsert.ts`), which the
   0e survey confirmed correctly force `countryAccountsId` from the API key server-side, immune to
   payload spoofing.

   Three distinct, confirmed consequences, by CSV import mode:
   - **Create, column omitted**: the row is created with `countryAccountsId = null` (the column is
     nullable at the DB level, and neither `validate()` nor `hazardousEventCreate` requires it) —
     an orphan record invisible to every tenant-scoped list view, permanently.
   - **Create, column present with an arbitrary tenant**: the record is created under _that_
     tenant, not the uploader's own — requires no prior knowledge of any existing record, only any
     valid `countryAccountsId` UUID. This is the most severe of the three: a user with `EditData`
     permission in their own tenant can inject fabricated hazardous events into any other tenant's
     data by simply filling in that column.
   - **Update / upsert, column present**: `hazardousEventUpdate`'s own `oldRecord` lookup (event.ts
     ~line 812) _does_ require `fields.countryAccountsId` to match the target row's real tenant —
     so exploiting this direction needs the attacker to also know the target record's actual
     `countryAccountsId` (a UUID, not treated as secret anywhere in the app) in addition to either
     its `id` (csvUpdate) or a colliding `apiImportId` (csvUpsert, see finding 2). Less severe than
     the create-time injection, but still a real cross-tenant write once that UUID is known.

2. **`csvUpsert`'s existing-record lookup has no tenant filter at all**, compounding finding 1 for
   the upsert mode specifically. `csv-import.tsx` wires
   `idByImportIdAndCountryAccountsId: hazardousEventIdByImportId` — but `hazardousEventIdByImportId`
   (event.ts) is a 2-parameter function (`tx, importId`) with **no** `countryAccountsId` parameter
   at all, unlike the correctly tenant-scoped `hazardousEventIdByImportIdAndCountryAccountsId`
   that the `upsert.ts` API route uses instead. `csvUpsert` calls it with a 3rd
   `countryAccountsId` argument that's silently dropped, same mechanism as finding 1. Net effect:
   an `apiImportId` collision resolves to a foreign tenant's record and (per finding 1's third
   bullet) can be updated in place instead of a new record being created — confirmed via a
   dedicated test using two seeded tenants and a shared `apiImportId`.

### Confirmed quirk

3. **CSV import's `countryAccountsId` handling design is inconsistent with the JSON API routes on
   the same underlying data.** The three write API routes deliberately don't let the payload
   specify `countryAccountsId` at all (forced server-side from the API key). CSV import, by
   contrast, exposes `countryAccountsId` as an ordinary, freely-editable column in every template
   (`fieldsDefApi` includes it for all three modes) — suggesting CSV import may have been
   originally designed for a different (perhaps super-admin, cross-tenant bulk-load) use case than
   its current `EditData`-permission gate implies. Worth a product decision on intended CSV-import
   semantics before deciding the fix, not just patching the signature mismatch.

### JSON API routes (`add`/`update`/`upsert`/`list`/`fields`/`_index`) — confirmed safe by contrast

**Test file:** `tests/integration/db/models/hazardousEventJsonApiTenant.test.ts` (3 tests, all
green) — PGlite, calling `jsonCreate`/`jsonUpdate`/`jsonUpsert`
(`app/backend.server/handlers/form/form_api.ts`) directly, reproducing exactly what each route
does before calling them. Moved here from E2E after the `apiAuth` finding above made the real-DB
E2E tier for this route family too unstable to use today — see that finding for why, and for what
a working E2E pass would still need to add later (raw `X-Auth` header handling, HTTP status codes,
the two-routes-vs-six roadmap undercount).

Unlike CSV import, all three write routes are correctly tenant-safe, confirmed via direct trace
and empirical test:

- **`add.ts`** forces `countryAccountsId` onto every payload item
  (`data.map(item => ({...item, countryAccountsId}))`) **before** calling `jsonCreate` — the
  spoofed value never reaches `hazardousEventCreate` at all. `jsonCreate`'s own `create(ctx, tx,
data)` call is a clean 3-arg match to `hazardousEventCreate`'s real signature — no signature
  mismatch here, because the override already happened at the route level.
- **`update.ts`** uses `hazardousEventUpdateByIdAndCountryAccountsId`, which takes
  `countryAccountsId` as an explicit 5th parameter (not read from row data) — confirmed this
  rejects a foreign-tenant `id` with `res.ok: false`, record left untouched.
- **`upsert.ts`** uses the correctly tenant-scoped
  `hazardousEventIdByImportIdAndCountryAccountsId` (the same function CSV import _should_ be using
  instead of the unscoped `hazardousEventIdByImportId` — see finding 2 above) — confirmed an
  `apiImportId` collision with a foreign tenant's record creates a genuinely new record rather
  than overwriting the foreign one.

**Confirmed quirk, not a bug:** `update.ts` calls `apiAuth(request)` twice — once directly, then
again inside `authActionApi(...)`, which itself just calls `apiAuth` again. Same API key, same
result both times; purely a redundant double lookup (`add.ts`/`upsert.ts` call it once), not an
auth-bypass or behavioral difference.

**Not yet covered (0e continues):** the presentation-layer gaps found in the initial survey
(delete-guard variants, parent-linking via the UI, approval-transition variants beyond the one
already-covered draft → waiting-for-validation transition) still need real browser E2E, which is
blocked pending a decision on the E2E harness instability found above.

---

## 0f — Cross-boundary with Disaster Events

**Test file:** `tests/integration/db/models/hazardousEventDisasterEventBoundary.test.ts` (6 tests,
all green) — PGlite, exercising `HazardousEventRepository`/`EventCausalityRepository` directly plus
a code trace of `app/routes/$lang+/disaster-event+/edit.$id.tsx`'s `syncLinkedHazardousEvents`.

Scope: every place DE-side code reads from or writes to HE's tables, so Phase 4/5 know exactly what
must keep working. Two link mechanisms exist and behave differently:

1. **`disasterEventTable.hazardousEventId`** (singular, the primary trigger) — read/write via
   `disasterEventCreate`/`disasterEventUpdate` in `event.ts`.
2. **`event_causality` rows** (plural, `triggeringHazardousEventId`/`triggeredHazardousEventId`) —
   written via `EventCausalityRepository.createMany`/`deleteById`, driven by
   `syncLinkedHazardousEvents` in the DE edit route's action, for the "linked triggering/triggered
   hazardous events" picker UI.

### Real bug found — confirmed via direct code trace + empirical repository-level test

**BUG: `event_causality` HE↔DE links have no tenant check, unlike the singular `hazardousEventId`
field, which the same file explicitly guards.**

`disasterEventCreate` (`event.ts` ~1825) and `disasterEventUpdate` (~1971) both look up the
referenced HE's `countryAccountsId` and reject a mismatch with a dedicated error code,
`hazardous_event.cannot_reference_other_tenant` — the team clearly identified and guarded this
exact risk for the singular field.

`syncLinkedHazardousEvents` (`edit.$id.tsx` ~901) has no equivalent. Its inputs
(`linkedTriggeringHazardousEventIds`/`linkedTriggeredHazardousEventIds`) are `JSON.parse`d
straight from form data (~448–549, array-cast only, no id filtering) and handed to
`EventCausalityRepository.createMany`/`deleteById` with zero tenant validation in between.
`EventCausalityRepository.createMany` itself (`eventCausalityRepository.ts`) is a raw insert — it
validates nothing.

**Not proven end-to-end through the real HTTP action** (the E2E tier is the unstable one from the
`apiAuth` finding above) — proven at the repository layer instead: `createMany` happily accepts and
persists a `triggeringHazardousEventId` belonging to a different tenant than the DE it's linked to,
and `getLinkedHazardousEventIds` (the same function the DE edit page's loader uses to populate
"currently linked" state) then returns it as if it were a normal link. Given the route performs no
filtering of its own before calling `createMany`, and the picker UI's own `blockedHazardousIds`
mechanism (see below) shows the team already builds server-side exclusion lists for this exact
picker — just for a different purpose (excluding already-linked/opposite-direction ids, not foreign
tenants) — this reads as an oversight, not a deliberate choice. Practical impact: a DE editor who
already knows or guesses a foreign-tenant HE's UUID can link their own DE to it, bypassing the
picker's own tenant-scoped search entirely, since the search only constrains what's _suggested_,
not what's _accepted_ on save.

### Confirmed safe / quirks (preserve as-is unless explicitly decided otherwise)

- **`HazardousEventRepository.getLinkableOptionsData`** (the picker's search/list query) is
  correctly tenant-scoped — `countryAccountsId` filter on the base query, and the division-name
  search subquery also scopes through `divisionTable.countryAccountsId`. Confirmed via test.
- **`blockedHazardousIds` exclusion** works as designed — ids passed in are excluded from the
  picker's results via `notInArray`. Confirmed via test.
- **QUIRK: silent 200-record truncation with no search term.** `getLinkableOptionsData` caps
  results at `shouldSearch ? 500 : 200` with no offset/pagination — a tenant with more than 200
  hazardous events and no keyword typed simply cannot see the rest in the picker, with no
  indication anything was cut off. Confirmed via test.
- **QUIRK: HIP name search matches against raw JSON, not the localized string.** The `ilike`
  clauses `cast(hh.name as text) ilike '%term%'` match against the serialized `{"en": "..."}` blob,
  which happens to work for English substrings by accident of JSON formatting, while the picker's
  own _display_ goes through proper localization elsewhere. Not tested further — low value, only
  matters once a second language's HIP names diverge from English in ways that don't substring-match
  the same way.
- **QUIRK: `getLinkedHazardousEventIds` (read) is NOT blocked by a cascade-deleted HE** — same
  pattern as 0a's finding #8 (delete-dependent-check gap): deleting an HE that's linked only via
  `event_causality` succeeds silently, and the causality row cascade-deletes with it. Confirmed via
  test; not a new finding, just the DE-read-side confirmation of the same known gap.
- **Diff pattern in `syncLinkedHazardousEvents` differs from HE's own spatial-footprint sync.**
  `syncLinkedHazardousEvents` does delete-removed/insert-only-new (a true diff against current
  rows); HE's `syncHazardousEventSpatialFootprint` (0d) does delete-then-recreate wholesale. Not a
  bug either way — just worth Phase 5 picking one pattern deliberately rather than inheriting both
  by accident.

**Out of scope, correctly:** the DE-to-DE recursive ancestor/descendant queries
(`getDescendantDisasterEventIds`/`getAncestorDisasterEventIds`) never touch HE's tables — DE-internal,
not this boundary.

---

## 0g — Synthesis

Per the roadmap's own spec for this track: confirm or correct every quirk listed under Invariant
1, resolve the `validation_workflow.ts` HE-only question definitively, and flag anything 0a–0f
found that isn't already captured in the roadmap's open-decisions list. This section is that audit
note — it stays on this branch (per the roadmap: "each still lands as its own commit on
`feature/ca-he-behavior-audit`"); the mechanical fold-back into the roadmap document itself is a
separate, later step.

### Invariant 1 quirks — confirmed and corrected against 0a–0f

1. **Cycle detection, depth-10 cap — confirmed, but the roadmap's own framing undersells it.**
   The roadmap describes this as "not an exhaustive graph traversal." 0b's finding #1 goes further:
   this isn't just incomplete coverage, it's a proven, empirically-reproduced data-integrity gap —
   a 20-node chain closing a cycle across its own full length **succeeds and gets persisted**, not
   merely "might miss a hypothetical edge case." Strengthens open decision #7 (DB-level
   cycle-prevention vs. keeping the app-layer check) from "worth considering" to "the current
   approach has already been shown not to hold its own guarantee under a realistic construction."
2. **Delete's dependent-check "two different ways" — confirmed, but actually undercounts by one.**
   0a and 0f together establish there are **three** styles today, not two: (a) disaster events
   linked via `disasterEventTable.hazardousEventId` — pre-checked explicitly, working correctly;
   (b) other hazardous events listing this one as `parent` — intended to be a reactive
   FK-violation catch, but 0a finding #6 shows the catch itself is dead code (checks
   `error?.code`, but Drizzle nests the real code under `error.cause.code`) — so in practice this
   is **unchecked**, not "checked reactively," a raw uncaught error propagates instead of the
   intended friendly message; (c) disaster events linked via `event_causality` (0a finding #8, 0f)
   — never checked at all, by design or oversight, cascade-deletes silently. Whoever makes the
   "preserve or fix, per item" call the roadmap asks for needs this corrected count: (a) is a
   genuine "preserve as designed" candidate, (b) is not actually "preserve as designed" since what
   ships today isn't the intended behavior at all — only fixing the error-shape check would
   restore the _original_ intent, which is itself a design choice to make, not a given — and (c)
   has no existing intended behavior to preserve, it's a pure gap.
3. **Temporal-order check, both-dates-required — confirmed exactly**, no correction. 0b adds one
   relevant nuance not in the roadmap's original wording: mixed-granularity dates (e.g. a
   month-only parent date) normalize optimistically to the 1st of the period (0b finding #4) —
   worth naming explicitly if Phase 2/3 revisits this rule's precision.
4. **HIP hierarchy consistency, shared helper — confirmed, with two behavioral properties the
   open-decision write-up (#6) should carry forward.** `getRequiredAndSetToNullHipFields` (a) is
   permissive on a fully-empty hierarchy in isolation, currently masked only by a DB-level
   `NOT NULL` constraint rather than by the helper's own logic (0a finding #1's correction), and
   (b) **mutates its input object in place** as a side effect of computing its return value (0d
   finding #4) — a caller passing a fields object and relying on its original shape afterward would
   see it silently altered. Both matter directly for "where this logic lives after the refactor"
   (open decision #6): a shared helper with a masked validation gap and a mutating side effect is
   exactly the kind of thing that shouldn't be duplicated or reused without deliberately deciding
   whether to carry both properties forward.
5. **`validation_workflow.ts` hardcoded to `hazardousEventTable` — confirmed, and now formally
   superseded by a stronger finding, not just an architectural non-issue.** See the dedicated
   section below — the file's actual current behavior no longer needs preserving as HE-only,
   because the live replacement already isn't.

### `validation_workflow.ts` HE-only question — resolved definitively

**Not HE-only in the live system, and hasn't been for a while.** `validation_workflow.ts`'s
`processValidationAssignmentWorkflow` (dead code, part of the orphaned `event/` directory — see
the cross-cutting section above) genuinely was hardcoded to `hazardousEventTable`, matching the
roadmap's original observation about that specific file. But its live functional replacement,
`handleApprovalWorkflowService` (`approvalWorkflowService.ts`, dispatching
`handleSubmitForValidation` internally for the `"submit-validation"` action), is **already
generic and already shared** — confirmed via its own type (`EntityType = "hazardous_event" |
"disaster_event" | "disaster_records"`) and, more importantly, via real call sites: both
`disaster-event+/edit.$id.tsx` and `disaster-record+/edit.$id.tsx` already call
`handleApprovalWorkflowService(ctx, tx, id, "disaster_event" | "disaster_records", ...)` today,
not just HE's edit routes. The same is true of the second live path (0c's architecture finding,
mechanism 3): `disaster-event+/$id.tsx` and `disaster-record+/$id.tsx` both call
`processApprovalStatusActionService`, the exact structural twin of what HE's detail page calls via
`updateHazardousEventStatusService`.

Net effect for Phase 2/3: the roadmap's target design (a shared, polymorphic
`app/domains/validation-workflow/` module) isn't introducing sharing where none existed — it's
formalizing sharing that already exists today, just spread across two independently-duplicated
generic services (0c's architecture finding) instead of one unified module. That duplication-of-
generic-logic, not a false HE-only assumption, is the actual risk this phase needs to retire.

### New/strengthened inputs for the roadmap's "Open decisions carried forward"

- **Item 6** (shared HIP-hierarchy logic) — strengthen with the two behavioral properties above
  (masked empty-hierarchy permissiveness; in-place mutation).
- **Item 7** (DB-level cycle prevention vs. app-layer check) — strengthen with 0b's empirical
  proof that the current cap is already broken in a realistic, non-contrived scenario, not just
  theoretically incomplete.
- **Item 8** (spatial observation model: snapshot vs. reference) — strengthen with 0d finding #3:
  confirmed today's "Geographic level" items are never snapshotted, only referenced, and
  retroactively change if the division is later renamed/reshaped — a concrete current-behavior
  data point for whichever way this decision goes.
- **Propose new item 9: publish silently overwrites the original validator's attribution (0c
  finding #1).** Different in kind from items 5–8 — this isn't a Phase 0 architecture question,
  it's a product/business-rule ambiguity (should `submit-publish` require prior validation, or is
  direct publish a legitimate path that needs its own explicit attribution-preserving fix?) that
  needs a PM decision before any phase can act on it. Not an "action item" below because there's no
  known fix to schedule yet, only a decision to make first.

---

## Action items for the refactor plan (safe to defer, not to lose)

These items are deliberately **not** being fixed on the current system, agreed with you given HE
usage is already paused ahead of the new implementation going live — the risk window is
effectively zero regardless of when within the refactor's timeline the fix actually lands, as long
as it lands before real users return. Recorded here, not just left as findings, so 0g's synthesis
carries them into the roadmap as concrete deliverables rather than something that has to be
rediscovered later.

1. **CSV import tenant-scoping bug → Phase 6 (Presentation: New Hidden Route + CSV/API), by
   construction.** When the new implementation's CSV import is built, it must force
   `countryAccountsId` server-side before any create/update/upsert call — matching the pattern
   the existing JSON API routes (`add.ts`/`upsert.ts`) already get right, not the pattern the
   existing CSV import gets wrong. No separate task needed beyond making sure whoever implements
   Phase 6 has read this finding first; the fix is inherent to building it correctly the first
   time, not a patch applied afterward.
2. **`apiAuth`'s dead not-found guard → Phase 6, explicit deliverable (bundled, per your
   direction).** Unlike finding 1, this does **not** get fixed automatically just by HE's new
   routes existing — `apiAuth` is shared infrastructure (`app/backend.server/models/api_key.ts`),
   not owned by HE's domain module, and HE's new routes will most likely call the same shared
   function. Explicitly scoped into Phase 6 as its own line item: fix `if (!key)` → `if
(key.length === 0)` (or equivalent) in `apiAuth`, verified against both a missing and an
   invalid `X-Auth` header. Low risk, small diff, benefits every API-key-gated route across every
   domain — not just HE's.
3. **E2E harness instability (`ECONNREFUSED`/hangs against the real-Postgres dev server) →
   tracked, no fixed deadline.** Genuinely different in kind from 1–2: it's a test-tooling
   problem, not a production risk, so it doesn't need a phase commitment. Revisit whenever 0e's
   remaining presentation-layer characterization (delete-guard variants, parent-linking,
   approval-transition variants) is picked back up — that work is blocked on this being resolved
   or worked around, but nothing else is.
4. **`event_causality` HE↔DE linking has no tenant check → Phase 4 (Use Cases) / Phase 5
   (Repository + Module Wiring), whichever owns the new "link hazardous event to disaster event"
   use case.** DE-side scope, not HE's Phase 6 — flag for whoever builds the new causality-linking
   logic. The fix is a same-tenant check before persisting a link, mirroring the guard
   `disasterEventCreate`/`disasterEventUpdate` already apply to the singular `hazardousEventId`
   field today (`hazardous_event.cannot_reference_other_tenant`) — the new implementation should
   apply that same rule uniformly to both link mechanisms instead of inheriting today's split.
5. **Spatial-footprint "Geographic level" division linking has no tenant check (0d finding #1) →
   Phase 3 (Domain Entity + Ports), fixed by construction.** HE's own domain scope, unlike item 4.
   `syncHazardousEventSpatialFootprint`'s division-validity check today is
   `where(inArray(divisionTable.id, divisionIds))` with no `countryAccountsId` filter — same bug
   family as items 1 and 4, just inside HE's own module this time. When the new domain entity's
   spatial-linking logic is built, it must scope the division lookup by tenant from the start,
   matching the guard `hazardousEventUpdate`'s `parent`-linking already gets right today
   (`ErrCrossTenantReference`) — no separate task, just a correctness requirement on Phase 3's own
   implementation.
6. **Empty-string-instead-of-null crashes with a raw Postgres UUID error, recurring across two
   independent call sites → Phase 3 (Domain Entity + Ports), fixed by construction.** Found twice
   independently — `hazardousEventCreate`/`Update` spreading `createdByUserId`/etc. directly into
   the insert (0a finding #7), and `processValidationAssignmentWorkflow` writing
   `submittedByUserId` before its own "skip if empty" guard is even checked (0c finding #2) — both
   root-caused to the same thing: `HazardousEventFields` types these columns as non-nullable
   `string`, not reflecting that `""` is a real value some caller can pass, so nothing sanitizes it
   before it hits the DB as a raw UUID-parse failure. Two independent occurrences of the identical
   mistake is a signal this is a typing/boundary-validation gap, not a one-off. Phase 3's domain
   entities, if properly typed (`string | null`, not `string`) with input validation at the
   boundary (per ADR-003's `DomainError` hierarchy, already the plan for this phase), close this
   off structurally rather than needing a per-field patch.
