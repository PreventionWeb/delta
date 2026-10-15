## Context

`IHazardousEventRepository` (`app/domains/hazardous-events/application/ports/
IHazardousEventRepository.ts`) is consumed today only by an in-memory
`FakeHazardousEventRepository` (`IHazardousEventRepository.test.ts`) and by six real
use-cases. No real adapter exists anywhere in the codebase (confirmed by direct search).
This change builds the first one, for the port's four core methods only.

`HazardousEvent`'s domain entity (`app/domains/hazardous-events/domain/HazardousEvent.ts`)
deliberately excludes approval-status and HIP-hierarchy fields that the live
`hazardous_event` table still carries (`createdUpdatedTimestamps`, `approvalFields`,
`approvalWorkflowFields`, `hipRelationColumnsRequired()` — all legacy spreads on the table
definition, `app/drizzle/schema/hazardousEventTable.ts`). The adapter's `toRow`/`toProps`
mapping is therefore a strict subset of the table's columns, matching
`DrizzleWorkflowRepository.server.ts`'s own precedent for a similarly-shaped legacy table.

`5j` (`openspec/changes/archive/2026-10-12-ca-workflow-optimistic-locking/`) is the direct
precedent for splitting `save()` into `insert()`/`update(instance, expectedUpdatedAt)` and
is re-read in full before this design — see Decision 1 for where this design follows it
exactly and Decisions 2-3 for where `HazardousEvent`'s own shape forces a deviation.

Confirmed via direct read of `DeleteHazardousEventUseCase.ts`: it already calls
`countReferencingDisasterEvents` (along with `IEventCausalityRepository.countReferences`
and `ICausalChainRepository.countEdgesTouching`) and throws `ConflictError` before ever
reaching `this.hazardousEventRepository.delete()` — the assumption in this change's own
intent ("delete() does not need to re-implement that pre-check") is **confirmed, not
contradicted**.

## Goals / Non-Goals

**Goals:**

- A working, transactionally-correct Postgres adapter for `findById`, `findAll`,
  `insert`/`update` (replacing `save`), and `delete`.
- Close `DEF-035` (legacy delete-transaction replication) and `DEF-037` (lost-update
  protection), each per its own exact register wording.
- Surface, not silently resolve, every genuine open design question found during Phase 0
  validation — including one (`hip_type_id NOT NULL`) not anticipated by this change's own
  intent description.

**Non-Goals:**

- Spatial-observation methods (`5e`) and `countReferencingDisasterEvents` (`5f`) — same
  file, separate later intents.
- Any route or NestJS provider wiring (`5g`) — this change only makes the adapter
  consumable by the existing use-cases against real data for the first time; nothing
  invokes them from an HTTP path yet.
- Transactional atomicity *across* `HazardousEvent.save()` and `WorkflowInstance`/
  causal-edge writes in the same use-case (`DEF-026`, `5k`'s territory) — this change's
  transaction boundary is internal to one `insert()`/`update()`/`delete()` call only.
- A reusable, cross-repository optimistic-locking abstraction (`DEF-038`) — this design
  solves `IHazardousEventRepository` concretely, following `5j`'s own precedent-not-library
  framing.
- Confirming Phase M's backfill completion — out of this change's visibility; noted as an
  inherited open condition (Risks).

## Decisions

### Decision 1 — Split `save()` into `insert()`/`update()`, following `5j` exactly for the split itself

**Chosen:** mirrors `5j` Decision 1 precisely:

```ts
insert(entity: HazardousEvent): Promise<HazardousEvent>;
update(entity: HazardousEvent, expectedUpdatedAt: Date | null): Promise<HazardousEvent>;
```

Both real callers already know which case they're in — `CreateHazardousEventUseCase`
always constructs a brand-new entity (`insert`), `UpdateHazardousEventUseCase` always
loads an existing one first via `findById` (`update`) — identical to `5j`'s own finding
for `IWorkflowRepository`'s two callers. No optional-parameter escape hatch, for the same
reason `5j` rejected one: it would silently reopen `DEF-037` for any caller that forgets to
pass a token, with no compiler error to catch the omission.

**Alternative considered and rejected:** keep `save()` as one method, branching internally
on an `exists: boolean` flag added to `HazardousEventProps`. Rejected for the identical
reason `5j` rejected it for `WorkflowInstance` — this is a persistence concern, not a
domain concept, and does not belong on the entity.

### Decision 2 — `expectedUpdatedAt: Date | null`, not `Date` — a genuine deviation from `5j`, not a silent copy

**Chosen:** unlike `WorkflowInstance.updatedAt` (always a `Date`, confirmed via direct read
of `WorkflowInstance.ts:367-368` — "the two fields (createdAt/updatedAt) that are never
null"), `HazardousEvent.updatedAt` is typed `Date | null` on the domain entity itself, and
genuinely is `null` for the common case of an event that has been created but never yet
updated (confirmed via direct read: `CreateHazardousEvent.ts` constructs its
`HazardousEventProps` with `updatedAt: null` explicitly; the DB column
(`createdUpdatedTimestamps.updatedAt`) is nullable with no `NOT NULL`, consistent with
this). `update()`'s first real call for any given event is therefore always racing against
a `null` prior value, not a `Date` one.

`update()`'s conditional `WHERE` clause branches on this:

- `expectedUpdatedAt === null` → `isNull(hazardousEventTable.updatedAt)`
- `expectedUpdatedAt !== null` → the `date_trunc`-based equality from Decision 3

A plain `eq(hazardousEventTable.updatedAt, null)` is not valid SQL (`=  NULL` never
matches), so this branch is a correctness requirement, not a style choice — without it,
every event's very first `update()` call would always find zero rows and always throw
`ConcurrentModificationError`, even with no real conflict.

**Alternative considered and rejected:** make `update()` reject a `null` token outright,
forcing `UpdateHazardousEventUseCase` to call `insert()`-shaped logic for an event's first
edit. Rejected — `HazardousEvent` has no "first edit" concept distinct from any other edit
once the event itself has been created (unlike `WorkflowInstance`, whose two call sites are
cleanly insert-vs-update by construction); forcing this split onto `HazardousEvent` would
require a wholly new "is this the first update" signal with no existing source of truth.

**Flagged explicitly for human confirmation**, per this change's own standing instruction
that a `5j`-precedent deviation must be surfaced, not silently implemented or silently
avoided.

### Decision 3 — CAS comparison against the column's own type (no `timestamptz` cast); millisecond truncation retained

**Chosen:** `hazardous_event.updated_at` (via `createdUpdatedTimestamps`,
`app/utils/drizzleUtil.ts:41-46`) is a legacy `timestamp` **without** time zone — unlike
`workflow_instance.updated_at`, which `5j`'s own schema already declares `{ withTimezone:
true }`. `5j`'s `update()` casts its comparison value to `::timestamptz`
(`DrizzleWorkflowRepository.server.ts:222`); doing the same here would implicitly convert
through the Postgres session's `TimeZone` setting on a column that has no zone of its own,
silently reintroducing a false-conflict risk `5j` doesn't have. This adapter's comparison
instead casts to the column's own `timestamp` type, with the same millisecond-truncation
`5j` uses for the same reason (the DB column defaults to microsecond precision; every row
this adapter itself ever writes carries full application-computed precision):

```sql
date_trunc('milliseconds', hazardous_event.updated_at)
  = date_trunc('milliseconds', $expectedUpdatedAt::timestamp)
```

**Inherited, not re-litigated**: the clock-tie gap this truncation carries is the same one
`DEF-038` already documents for `5j` — accepted here for the identical reason, not a new
finding.

### Decision 4 — `insert()`/`update()` each run as one transaction spanning the parent row and all four child collections

**Chosen:** `insert()`: `event` row → `hazardous_event` row → four child-collection
inserts (`hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`), each
skipped entirely when its collection is empty (an empty-array `.values([])` call is a
malformed insert, not a no-op, on this driver — matches
`DrizzleHazardTaxonomyRepository`'s own "no query for an empty input" precedent, applied
here to writes instead of reads). `update()`: the CAS-guarded conditional `UPDATE` on
`hazardous_event` first; only if it affects a row does the same transaction delete-and-
reinsert each of the four child collections (mirrors `DrizzleCausalChainRepository.
replaceCauseEdge`'s delete-then-insert shape, applied four times). A zero-row `UPDATE`
throws before any child write is attempted, and the transaction rolls back the whole
attempt — so a lost CAS check cannot leave stale children behind.

**The legacy `attachments` JSONB column on `hazardous_event` itself (inline legacy field,
distinct from the `hazardous_event_attachment` child table the domain's `attachments`
property maps to) is never written or read by this adapter** — confirmed via direct read
that it's nullable with no constraint, and the domain's `attachments` collection has no
relationship to it whatsoever; touching it would be mixing a dead legacy field into a
clean adapter for no reason.

**Alternative considered and rejected:** per-child-collection diffing (insert new rows,
delete removed ones, leave unchanged ones alone) instead of delete-and-reinsert-everything.
Rejected for this change — `UpdateHazardousEventUseCase`'s own spec already requires each
present collection field to "fully replace" the existing one, so there is no partial-diff
behavior to preserve, and delete-and-reinsert is simpor and matches the existing
`replaceCauseEdge` precedent in the same file family.

### Decision 5 — `findAll` skips a row that fails rehydration (logged), `findById` lets it throw; both tied to `DEF-031`, not a fresh finding

**Chosen:** `HazardousEvent.create()` validates on every rehydration — a stored row with,
e.g., a non-empty-string-required field actually empty (plausible for a pre-Phase-M or
legacy-written row) throws `ValidationError`. For `findById`, this propagates unmodified —
a single bad row for an explicitly-requested id should surface as an error, not disappear.
For `findAll`, one bad row must not sink an entire paginated result set: this adapter
catches only `ValidationError` from a single row's rehydration, logs a warning
(`hazardous_event.invariant_violation_skipped`, naming the row's `id`), and continues —
`5a`'s `DrizzleWorkflowRepository.findByEntityIds` (lines 129-144) is the exact existing
precedent for this shape, reused here rather than invented.

**Explicitly tied to `DEF-031`**, not a new finding: that register entry already flags
inconsistent missing/invalid-row handling across HE's own use-cases as a live risk "until
Phase M's backfill runs" — this decision's `findAll` behavior is one more instance of the
same class of gap, not a separate one.

Membership sets (`validHazardDriverIds`/`validCustomFieldDefinitionIds`) a rehydrated
`HazardousEvent.create()` call needs are built from the **loaded row's own ids** (the ids
actually present on that row's child collections), not from a fresh
`IHazardTaxonomyRepository` lookup — this adapter has no dependency on that port, matching
`DrizzleWorkflowRepository`'s own precedent of rehydrating from stored data without
re-deriving validity. A row's own previously-valid ids are assumed sufficient to pass
`HazardousEvent.create()`'s own membership check since that same validation already ran
once at write time.

### Decision 6 — `delete()`'s tenant gate is the first statement, `RETURNING`-checked, before any supertype/relationship cleanup runs

**Chosen:** the legacy transaction (`event.ts:1728-1789`) checks existence *before*
opening its transaction, then deletes by `id` alone *inside* it — two separate steps, with
a real (if narrow) window between them. This adapter instead makes the tenant-scoped
`DELETE FROM hazardous_event WHERE id = ? AND country_accounts_id = ? RETURNING id` itself
the first statement inside the transaction; if it returns zero rows (missing id, or a
foreign-tenant id), the transaction does nothing further and `delete()` resolves normally
per the port's existing no-throw-on-no-match contract. The incoming-`event_relationship`
delete and the `event`-row delete only run after a confirmed match. This closes a real gap
the legacy function doesn't need to close (it already pre-checks tenant/existence outside
the transaction) but a single-call adapter does: without this gate, a foreign-tenant `id`
would otherwise skip the `hazardous_event` delete (no cross-tenant row to delete there) but
still blindly run the incoming-relationship and `event`-row deletes for someone else's
event — a cross-tenant data-integrity bug this design closes by construction, covered by a
new spec scenario.

### Decision 7 (resolved — was an Open Question) — `hazardous_event.hip_type_id` migrates to nullable

**Found during Phase 0 validation, not part of this change's own original intent.**
Confirmed via direct read of the live schema: `app/drizzle/migrations/
20250325105544_initial_db.sql:653` declares `hip_type_id text NOT NULL` on
`hazardous_event`, with no column default; a full search of every later migration
touching this table found no `ALTER COLUMN hip_type_id DROP NOT NULL` or any default
added. `hazardous_event.hip_hazard_id`/`hip_cluster_id` are nullable; only `hip_type_id`
is `NOT NULL`, an asymmetry with no documented reason found. `HazardousEventProps`
(`HazardousEvent.ts`) has no HIP-hierarchy field of any kind — confirmed deliberate
(design.md Context, DEF-009). As the schema stood, a plain `insert()` of any
CA-constructed `HazardousEvent` would violate this constraint and fail with a `23502`
not-null violation — not a hypothetical, it would have blocked this change's own PGlite
insert tests from passing.

**Chosen (confirmed by the human reviewer): migrate `hip_type_id` to nullable.** A single
`ALTER TABLE hazardous_event ALTER COLUMN hip_type_id DROP NOT NULL`, no data change, via
`yarn dbsync`. Consistent with the domain's already-settled direction (DEF-009, DEF-018:
the whole HIP-hierarchy/approval-status column family on this table is legacy, staying
only until Phase 7e's cleanup) — relaxing a constraint on a column the new domain model
never populates is a small step in the same direction, not a new precedent. Residual risk:
any live legacy read/report that assumes `hip_type_id` is always present on every row
would see `NULL` for CA-written rows for the first time — accepted as an expected,
phased-migration trade-off (same shape as every other "old code meets new code" row in
this refactor), not evaluated exhaustively here. Confirmed concretely during
implementation, not just theorized: swapping to the nullable column type broke `yarn tsc`
at exactly two call sites (`app/backend.server/models/event.ts`,
`app/backend.server/models/event/hazardous_event_get.ts`), both calling `getTypeById`
unconditionally — fixed with the same null-guard shape already used there for
`hipHazardId`/`hipClusterId`, no further live call sites found.

**Alternative considered and rejected: compute a value via the HIPs crosswalk.**
`hazard_type.sourceRefId` (confirmed present, `hazardTypeTable.ts:16`) stores the legacy
`hip_class.id` the HIPs migration (`20261009042834_migrate_hips_with_multi_language_
support...sql`) derived it from, and the full join path to reach it from a
`HazardousEvent`'s own `specificHazardId` is confirmed present and populated
(`specific_hazard.hazardClusterId → hazard_cluster.id`,
`hazard_cluster.hazardTypeId → hazard_type.id`, `hazard_type.sourceRefId` → legacy
`hip_class.id`). Rejected: this adds a real join dependency on the taxonomy tables to what
should be a straightforward CRUD adapter, for a column the domain model has already
decided to exclude, plus a new failure mode (`sourceRefId` is nullable — a `hazard_type`
added after the HIPs migration, with no legacy equivalent, would have no crosswalk value
to supply) — real added complexity to solve a problem a one-line migration already solves
cleanly. If a genuine future need to keep legacy `hip_type_id` populated is identified,
this crosswalk is the mechanism, but it is new scope, not folded in here speculatively.

### Decision 8 (resolved — was an Open Question) — the `event_relationship` outgoing-role gap (`DEF-035`'s stated remaining gap) is inherited, mapped to ConflictError

The delete-hazardous-event use-case's own dependent check (confirmed via direct read,
and already stated in that capability's own spec Purpose) never gates on legacy
`event_relationship` rows at all — only `hazardous_event_causality` and `event_causality`.
An outgoing `event_relationship` row (this event as `parentId`, i.e. this event *causes*
another) is therefore never blocked before `DeleteHazardousEventUseCase` calls
`IWorkflowRepository.deleteByEntity` and then `IHazardousEventRepository.delete` — if
`delete()`'s own `event`-row deletion hits the real FK (`event_relationship_parent_id_
event_id_fk`), this happens **after** `deleteByEntity` has already committed, leaving the
`HazardousEvent` with no `WorkflowInstance` (compounds `DEF-033`, already documented as a
known, separate gap).

**Chosen (confirmed by the human reviewer): inherit the gap, but map the resulting FK
violation to a typed `ConflictError`.** `delete()` keeps today's cleanup scope exactly
(incoming rows only), but catches a `23503` on `event_relationship_parent_id_event_id_fk`
specifically and throws `ConflictError` with a message equivalent to the legacy function's
own friendly text ("delete events that are caused by this event first") — matching
`DrizzleWorkflowRepository`'s own `mapWriteError` precedent for turning a raw PG code into
a typed domain error. `DeleteHazardousEventUseCase`'s existing "repository errors
propagate unmodified" requirement already covers this without any use-case change — the
`ConflictError` surfaces to the use case's own caller exactly as any other dependent-check
conflict would, no spec change needed beyond this port's own delta.

**Alternative considered and rejected: finally fix it.** `delete()` could also delete
outgoing `event_relationship` rows (`parentId = id`) before deleting the `event` row,
fully closing `DEF-035`'s remaining gap. Rejected — **real side effect, the deciding
factor**: this would silently sever other events' recorded cause link to the event being
deleted — a second aggregate's data changes as a side effect of this delete, with no
confirmation step. This is a bigger behavior change than "adapter cleanup" — it is
curation of other events' causal links, which arguably belongs at the use-case/
dependent-check layer (a conscious decision to gate or to cascade), not silently inside
the repository's `delete()`.

**Alternative considered and rejected: inherit raw.** No mapping; a bare Postgres `23503`
error (wrapped in whatever shape `drizzle-orm`'s `DrizzleQueryError` produces) would
propagate to `DeleteHazardousEventUseCase`'s caller. Rejected — a real regression from the
legacy function's friendly, actionable error message to an opaque DB error.

**Register mechanics**: delete the `DEF-035` row entirely (resolve-by-deletion convention,
matching `5i`'s precedent for `DEF-021`/`DEF-030`) and add a new, narrower register row
describing only the remaining outgoing-role gap — do not leave `DEF-035` annotated in
place.

## Risks / Trade-offs

- **[Risk, resolved] Decision 7 (hip_type_id) and Decision 8 (outgoing-relationship gap)
  were both open questions during this document's drafting; both are now confirmed by the
  human reviewer** (Decision 7: migrate to nullable; Decision 8: inherit the gap, map to
  `ConflictError`) — tasks.md Section 0 records both as resolved, exactly as `5j`'s own
  tasks.md did for its two open questions.
- **[Risk, inherited from `5j`, not new] `DEF-038`'s clock-tie gap applies identically
  here** — a winning `update()`'s `now()` coincidentally equal to the row's existing
  `updated_at` means the token doesn't advance, so a separate stale caller could still pass
  the `WHERE` clause. Not fixed, for the same reason `5j` didn't fix it.
- **[Risk] Phase M's backfill (parallel team workstream, status not verified by this
  proposal) may write `hazardous_event.updated_at`/child rows through a path this adapter's
  own precision/shape assumptions don't anticipate.** → Same posture as `5j`'s identical
  risk for `workflow_instance`: the millisecond-truncation comparison prevents a *false
  conflict* from sub-millisecond drift; the residual risk is a rare *false non-conflict*,
  accepted as no worse than today's total absence of a check.
- **[Risk, explicitly not resolved by this change] `DEF-031`'s missing-`WorkflowInstance`
  inconsistency remains live** for whoever first wires a real route to
  `GetHazardousEventByIdUseCase`/`ListHazardousEventsUseCase` against this adapter and real
  data — this change makes that scenario reachable for the first time (real rows, not a
  fake), but adds no route itself. Noted here explicitly, per this change's own standing
  instruction not to silently drop a cross-cutting condition just because it isn't this
  change's own job to fix.
- **[Trade-off] Decision 4's delete-and-reinsert-everything for child collections on every
  `update()` is less efficient than per-row diffing** for an event with many unchanged
  attachments/field values. Accepted: matches `UpdateHazardousEventUseCase`'s own
  full-replace contract already in its spec, and this table family's row counts are small
  (a handful of drivers/attachments/field values per event, not thousands).
- **[Trade-off] Decision 5's rehydration-skip for `findAll` means a caller never learns
  exactly how many rows were silently skipped**, only that the returned page may be
  shorter than `pageSize` even when more matching rows exist. Accepted, matching `5a`'s own
  precedent exactly; revisiting this (e.g. surfacing a skip count) is `DEF-031`'s territory
  if it's ever picked up as its own intent, not this change's to solve.

## Migration Plan

One migration, per Decision 7's resolution: `ALTER TABLE hazardous_event ALTER COLUMN
hip_type_id DROP NOT NULL`, applied via `yarn dbsync` — no data backfill, no drizzle-kit
push, reversible by re-adding the constraint (safe only if no row written in the interim
has a `NULL` value, which is the expected and intended effect of this very change). No
migration is needed for any other part of this change — the four child tables and
`hazardous_event`'s other columns are already correctly shaped (confirmed via direct
read).

Rollback for the interface-shape change (`insert`/`update` replacing `save`) is a plain
revert of the same commit set, identical in kind to `5j`'s own migration plan — no
persisted data shape changes from the interface split itself, so no forward/backward data
compatibility concern there either way.
