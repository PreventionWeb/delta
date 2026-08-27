# Hazardous Events Phase 0 — Audit Findings

Companion to `hazardous-events-refactoring-roadmap.md` (Phase 0, sub-tracks 0a–0f). Written as a
sibling doc rather than appended directly to the roadmap so this branch
(`feature/ca-he-behavior-audit`) stays independently mergeable without needing
`feature/ca-hazardous-events-scaffold` merged in first — see 0g for how this gets folded back
into the roadmap once all sub-tracks land on `dev`.

Each section corresponds to one Phase 0 sub-track and its characterization test file.

---

## 0a — Core CRUD

**Test file:** `tests/integration/db/models/hazardousEventCoreCrud.test.ts` (27 tests, all green)

### Confirmed quirks (preserve as-is unless explicitly decided otherwise)

1. **HIP hierarchy validation only fires on a *partial* hierarchy, not a missing one.**
   `getRequiredAndSetToNullHipFields` returns no error at all when `hipHazardId`/`hipClusterId`/
   `hipTypeId` are all unset — it only errors when hazard is set without cluster, or cluster is
   set without type. An event with zero HIP classification passes this check entirely (HIP
   completeness, if required at all, must be enforced elsewhere).
2. **The partial-hierarchy error is always attached to the `hipHazardId` field key**, even when
   the actual problem is a missing `hipTypeId` (cluster set, type missing). A form/API consumer
   reading `errors.fields.hipClusterId` or `errors.fields.hipTypeId` for that case would see
   nothing.
3. **Cycle detection is capped at recursion depth 10** (`array_length(cc.path, 1) < 10` in
   `checkForCycle`'s recursive CTE) — a legitimate causal chain longer than 10 hops would not be
   fully walked; whether this can be reached in practice with real data was not evaluated here.
4. **Temporal-order validation only blocks when *both* the proposed parent and child have a
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
   independently defends against a *similarly-shaped but not identical* nested-cause problem
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
   triggering/triggered hazardous events" feature). Deleting a hazardous event that is *only*
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
green). Shared seed helpers extracted from 0a into `hazardousEventTestHelpers.ts` (0a updated to
import from it, no behavior change — re-verified green after the extraction).

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

1. **`processValidationAssignmentWorkflow`** (`validation_workflow.ts`) — the "submit for
   validation" step only: assigns validators, moves `draft → waiting-for-validation`, emails
   validators. Called directly from `hazardous_event_create_update.ts`'s create/update
   `tempAction` branches.
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
   *publisher's* identity and the publish timestamp — not the original validator's. If a
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
   `submitted_by_user_id` column *before* the `if (submittedByUserId)` guard around the email
   call is even checked — so passing an empty string to intentionally skip the email crashes on
   the DB write first, with the same raw Postgres UUID-parse error as the 0a finding. The current
   single call site never triggers this in practice (an earlier guard already ensures a non-empty
   value reaches it), but the function has no such guarantee on its own if called elsewhere.

### Confirmed (non-bug) quirks

3. **`hazardousEventUpdateApprovalStatusNeedRevision` clears validated/published attribution but
   deliberately leaves `submittedByUserId`/`submittedAt` intact** — a revision request doesn't
   erase who originally submitted the record for validation.

---

## 0d–0f

Not yet started.
