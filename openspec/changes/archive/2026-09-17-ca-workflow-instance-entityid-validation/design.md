## Context

See `proposal.md` - Why. `WorkflowInstance.create()`
(`app/domains/validation-workflow/domain/WorkflowInstance.ts`, lines 119-178) currently
runs, in order: `entityType` enum check → `status` enum check → `createdAt`/`updatedAt`
Date-validity → four attribution-timestamp Date-validity checks (own loop, run before
pair-consistency by design, per the file's own comment at line 141) → attribution
pair-consistency → status-required-attribution. No step touches `entityId`.

`HazardousEvent.create()` (`app/domains/hazardous-events/domain/HazardousEvent.ts`, lines
71-82) is the pattern to match: a `for` loop over `["tenantId", "specificHazardId",
"startDate"]`, each checked with `value == null || value.trim().length === 0`, throwing
`ValidationError(`${field} must not be empty`)` — and this loop runs **first**, before
that file's own Date-validity checks.

## Goals / Non-Goals

**Goals:**

- Add a single presence check for `entityId` to `WorkflowInstance.create()`, positioned
  and worded identically in spirit to `HazardousEvent.create()`'s required-field loop.
- Pin the check's position in `create()`'s validation order via an explicit test
  scenario, so this isn't left as an implementer's judgment call the way the intent's own
  review found it was missed the first time.

**Non-Goals:**

- Do not generalize to a multi-field loop. `entityId` is the only field this change
  touches (see proposal.md Impact - Out of scope).
- Do not touch `WorkflowInstanceProps.id`'s equivalent gap.
- Do not add any DB migration, repository, or handler-layer code — no such caller exists
  yet (confirmed by the full-tree grep in proposal.md Impact).
- Do not change any other requirement in `workflow-instance-entity`'s spec (transitions,
  attribution pairs, `ConflictError` shape, etc.) — all untouched.

## Decisions

**Decision 1 — Check `entityId` first, before `entityType`/`status`.**
`HazardousEvent.create()` establishes the project's convention: required-field presence
is checked before enum/Date validation, so a caller passing multiple simultaneously-bad
fields gets the "field is missing" error rather than a less-actionable enum error. Adding
the `entityId` check as the _new first line_ of `WorkflowInstance.create()` — ahead of
the existing `entityType` check — matches that convention and keeps the two sibling
entities' validation ordering consistent with each other.

- _Alternative considered:_ append the check after the existing attribution-pair
  validation (i.e., last). Rejected — it would mean `WorkflowInstance` and
  `HazardousEvent` disagree on whether presence-of-required-field or
  enum-validity reports first for the same class of bad input, which is exactly the kind
  of inconsistency this change exists to close.

**Decision 2 — Reuse `HazardousEvent`'s exact check expression, not a shared helper.**
Write the check inline as `if (props.entityId == null || props.entityId.trim().length
=== 0)`, following `HazardousEvent.create()`'s own field-loop body verbatim in spirit.
Do not extract a shared `assertRequiredString()` helper into `~/shared/` for a single
call site in each of two files.

- _Alternative considered:_ extract a shared helper now, since two files would use
  it. Rejected — `HazardousEvent.ts`'s own header comment (line 39-42) explicitly chose
  to **redefine** `isInvalidDate` locally rather than import it across the
  hazardous-events/validation-workflow bounded-context boundary, to avoid a
  cross-bounded-context dependency. The same reasoning applies here: a two-line presence
  check isn't worth introducing a shared module between the two bounded contexts for.

**Decision 3 — Error message: `entityId must not be empty`.**
Match `HazardousEvent.create()`'s template literal exactly:
`` `${field} must not be empty` `` → for a hardcoded single field, literally
`"entityId must not be empty"`. Not `"entity_id is required"` or any other phrasing — the
new test asserts this exact string, and the two sibling entities should read as one
convention when a reviewer compares them side by side.

**Decision 4 (round 2) — Guard `entityId` with `typeof`, not just a null check; supersedes
Decision 2's literal expression.**
This change's own Gate 10 review (independent second-opinion, Claude Code's built-in
`/code-review` at high effort) found that Decision 2's expression —
`props.entityId == null || props.entityId.trim().length === 0` — throws a raw `TypeError`
rather than `ValidationError` if a caller passes a non-string, non-null `entityId` (e.g. a
number from a future untyped adapter), because `.trim()` doesn't exist on a non-string
value. That is the exact class of bug this whole refactor exists to close: a domain entity
must validate its own invariants, never let malformed input escape as an unhandled
exception. The fix: `typeof props.entityId !== "string" || props.entityId.trim().length
=== 0` — a single condition that already covers `null`/`undefined`/number/object/etc.
(none of which satisfy `typeof x === "string"`) and the empty/whitespace-only case,
without a separate null check. `WorkflowInstanceProps.entityId` is statically typed
`string`, so this only guards against a caller that bypasses TypeScript (an untyped
adapter, JS caller, or bad deserialization) — the same category Decision 2's own `== null`
check already existed to guard against.

This supersedes Decision 2's literal expression (`value == null || value.trim().length ===
0`), not its reasoning: no shared helper is extracted, the check still lives inline, and
it still matches `HazardousEvent.create()` in spirit. `HazardousEvent.create()`'s own
three-field loop has the identical gap and is being upgraded to the same `typeof` guard in
the same round, via the sibling change `ca-he-hazardous-event-entity` (its own design.md
Decision 10) — so the two sibling entities' required-field checks stay in sync with each
other, not diverging.

## Risks / Trade-offs

- [Risk] A future caller relying on `WorkflowInstance.create()` accepting an empty-string
  `entityId` (e.g. some yet-unbuilt draft/placeholder flow) would newly break. →
  Mitigation: the full-tree grep in proposal.md confirms no such caller exists today;
  the DB's own `NOT NULL` constraint means a persisted empty `entityId` was never valid
  regardless, so this only surfaces the same failure earlier and more clearly.
- [Risk] Scope creep — reviewers seeing this diff may expect `id`'s equivalent gap fixed
  in the same PR since it's adjacent and cheap. → Mitigation: proposal.md names `id` as
  an explicit out-of-scope observation so it reads as a decision, not an oversight.

**Concurrent callers rule (N/A):** `WorkflowInstance.create()` is a synchronous, pure
static factory with no shared mutable state, no cache, no queue, and no I/O — it cannot
be observed mid-flight by a second caller. The mandatory "concurrent callers" scenario
rule (for shared mutable state accessed by async operations) does not apply here; no such
scenario is added, per the rule's own scope, rather than inventing one to satisfy a
checklist.

**Gate 9 / presentation reference-page rule (N/A):** this change touches only
`app/domains/validation-workflow/domain/` — no file under `app/domains/*/presentation/`
and no route. Gate 9 (visual/UX parity) and design.md's reference-page requirement do not
apply; recorded here, and again in tasks.md, so a reviewer can see the gate was
considered and explicitly not skipped by omission.

## Migration Plan

None — no schema change, no data migration, no rollout sequencing. The change is a pure
addition to an existing in-memory validation function; deploying it takes effect the next
time `WorkflowInstance.create()` runs with an invalid `entityId`, with no state to
migrate forward or roll back.
