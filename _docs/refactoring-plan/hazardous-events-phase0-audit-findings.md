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

## 0b–0f

Not yet started.
