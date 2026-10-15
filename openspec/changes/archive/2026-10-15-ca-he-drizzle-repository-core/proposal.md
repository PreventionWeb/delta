## Why

`IHazardousEventRepository` has six real use-case consumers today
(`CreateHazardousEvent`, `UpdateHazardousEvent`, `DeleteHazardousEvent`,
`GetHazardousEventById`, `ListHazardousEvents`, `RecordSpatialObservation`) but only an
in-memory fake implements it — no route or production code path can actually persist or
read a `HazardousEvent` against real Postgres. This closes that gap for the port's four
core methods (`findById`, `findAll`, `save`→`insert`/`update`, `delete`), and with it two
deferred items that are explicitly gated on this adapter existing: `DEF-035` (the real
`delete()` must replicate the legacy transaction's multi-table cleanup) and `DEF-037` (no
lost-update protection on the eventual `save()`, now split into `insert()`/`update()`
following `5j`'s precedent). Spatial-observation methods (`5e`) and
`countReferencingDisasterEvents` (`5f`) are separate, later intents against the same file.

**Two items below were surfaced as blocking open design questions during drafting, not
decided unilaterally — both are now confirmed by the human reviewer (design.md Decisions
7-8):**

1. `hazardous_event.hip_type_id` is `TEXT NOT NULL` in the live schema (confirmed via the
   initial migration, never relaxed by any later migration) with no default, but the CA
   `HazardousEvent` entity deliberately carries no HIP-hierarchy field at all. This was not
   mentioned in this change's own intent and was found during Phase 0 validation, not
   assumed away. **Resolved: migrate the column to nullable** (one-line `ALTER TABLE`, via
   `yarn dbsync`) — a crosswalk-based alternative was considered and rejected as real added
   complexity for a problem the migration solves cleanly.
2. The legacy delete transaction's own `event_relationship` "outgoing role" gap (`0a`
   finding #6, `DEF-035`) remains open either way this change resolves it. **Resolved:
   inherit the gap, map the resulting FK violation to `ConflictError`** — matching the
   legacy function's own friendly error text, rather than fixing it (which would silently
   mutate other events' causal links as a side effect) or letting a raw DB error through.

## What Changes

- Add `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts`
  implementing `findById`, `findAll`, `delete`, and `insert`/`update` (replacing `save`) —
  file name and `.server.ts` suffix match the domain's existing adapter siblings
  (`DrizzleCausalChainRepository.server.ts`, `DrizzleHazardTaxonomyRepository.server.ts`),
  correcting the roadmap doc's stale `DrizzleHazardousEventRepository.ts` (no `.server.ts`)
  naming.
- **BREAKING**: `IHazardousEventRepository.save(entity)` is replaced by
  `insert(entity): Promise<HazardousEvent>` and `update(entity, expectedUpdatedAt): Promise<HazardousEvent>`,
  following `5j`'s `IWorkflowRepository` precedent exactly for the split itself (closes
  `DEF-037`). **One deliberate deviation from that precedent, not a silent copy**:
  `expectedUpdatedAt` is typed `Date | null`, not `Date` — `HazardousEvent.updatedAt` is
  `Date | null` on the domain entity itself (`null` until an event's first `update()`),
  unlike `WorkflowInstance.updatedAt`, which is never null. `update()`'s conditional `WHERE`
  branches on an `IS NULL` comparison when the token is `null`, a `date_trunc`-based
  equality otherwise (design.md Decision 2). The CAS comparison is also against the
  column's own type directly, not cast to `timestamptz` as `5j` did — `hazardous_event`'s
  `updated_at` column (via `createdUpdatedTimestamps`) is a legacy `timestamp` **without**
  time zone, so a `::timestamptz` cast would silently reintroduce a session-time-zone-
  dependent false conflict that `5j`'s own table doesn't have (design.md Decision 3).
- `insert()` writes the `event` supertype row, the `hazardous_event` row, and all four
  child collections (`hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues`)
  in one transaction. `update()`'s conditional `UPDATE` and the full replace-all of the
  four child collections run in the same transaction, so a lost CAS check rolls back any
  child writes too.
- `delete()` replicates the legacy transaction's cleanup order (`app/backend.server/models/
  event.ts:1728`, not the dead-code `DEF-001` twin): delete the `hazardous_event` row
  (tenant-gated, `RETURNING` used to confirm a match before touching anything else — the
  legacy function deletes by `id` alone and relies on its own separate existence
  pre-check, which this adapter folds into one tenant-scoped statement instead), then
  incoming `event_relationship` rows (`childId = id`), then the `event` supertype row.
  Validation-row cleanup (`entityValidationAssignment`/`RejectionDeleteByEntityId`) is
  already superseded by `5a`'s `IWorkflowRepository.deleteByEntity`, confirmed called
  separately by `DeleteHazardousEventUseCase` before this method — not re-implemented here.
- `findAll` adds a deterministic `ORDER BY` (the port's fake and spec are silent on order;
  a real adapter needs one for stable pagination) and batches each child collection's load
  with `inArray` across the page's ids, not per-row N+1 queries.
- `findById`/`findAll` rehydration: a stored row that fails `HazardousEvent.create()`'s own
  validation (e.g. a pre-Phase-M row with a null `specificHazardId` the domain requires
  non-empty) is a real possibility today, tied to `DEF-031`. `findById` lets the
  `ValidationError` propagate; `findAll` skips the offending row with a warning log,
  matching `5a`'s `DrizzleWorkflowRepository.findByEntityIds` precedent, so one bad row
  does not sink an entire page (design.md Decision 5).
- `CreateHazardousEvent.ts` (line 184) switches its one call from `save()` to `insert()`.
  `UpdateHazardousEvent.ts` (line 237) switches from `save()` to
  `update(updatedEvent, existingEvent.updatedAt)` — `existingEvent.updatedAt` (already read
  earlier in `execute()`) is the previously-read CAS token.
- Every fake implementing `IHazardousEventRepository` is updated from `save` to
  `insert`/`update` (mechanical, confirmed by grep: `IHazardousEventRepository.test.ts`,
  `CreateHazardousEvent.test.ts`, `UpdateHazardousEvent.test.ts`, `DeleteHazardousEvent.test.ts`,
  `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
  `RecordSpatialObservation.test.ts` — 7 test files, the 6 use-case fakes plus the port's
  own conformance fake).
- Reuses the existing `ConcurrentModificationError extends ConflictError`
  (`~/shared/errors`, added by `5j`) — no new error type.
- Deferred-items register: close `DEF-035` and `DEF-037` once implemented and the two open
  questions above are resolved; `DEF-038`'s clock-tie gap is inherited by the same
  `date_trunc`-truncated-comparison mechanism as `5j`, noted not re-litigated; `DEF-031` is
  noted in design.md as a still-open condition for whoever wires a real route to these use
  cases (`5g`/Phase 6) — this change adds no route and does not resolve it.

**Not in scope** (adjacent, explicitly deferred per the roadmap and standing instructions):

- `findCurrentSpatialObservation`/`findSpatialObservationByTime`/`saveSpatialObservation` —
  `5e`, a separate later intent touching the same adapter file.
- `countReferencingDisasterEvents` — `5f`.
- NestJS provider registration in `HazardousEventsModule` and any route wiring — `5g`.
- Confirming Phase M's backfill status for `DEF-031` purposes — that is a parallel
  workstream's own status, out of this change's visibility; noted, not resolved.

## Capabilities

### New Capabilities

(none — this implements an already-specified port's core methods against a real adapter;
see Modified Capabilities for the signature and behavior changes)

### Modified Capabilities

- `hazardous-event-repository-port`: `save()` is removed and replaced by `insert()`/
  `update()` (optimistic-locking semantics, `Date | null` CAS token, mandatory
  concurrent-callers scenario); `delete()`'s tenant-gating and cleanup-order requirements
  are made explicit against a real adapter for the first time; `findAll`'s ordering and
  partial-rehydration-failure behavior are specified; `findById`'s existing
  `NotFoundError` requirement is unchanged.
- `create-hazardous-event`: `CreateHazardousEventUseCase` calls `insert()` instead of
  `save()` (signature-only — several existing scenarios reference
  `IHazardousEventRepository.save` by name and need updating to `insert`).
- `update-hazardous-event`: `UpdateHazardousEventUseCase` calls
  `update(updatedEvent, existingEvent.updatedAt)` instead of `save(updatedEvent)`; a stale
  caller now rejects with `ConcurrentModificationError` instead of silently overwriting a
  newer state (closes `DEF-037`'s use-case-visible half).

## Impact

**Files added:**

- `app/domains/hazardous-events/infrastructure/DrizzleHazardousEventRepository.server.ts`
- `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (`import
  "../setup"` — matches this domain's existing adapter test location, correcting the
  roadmap doc's stale `tests/integration/domains/hazardous-events/` path, which does not
  exist in this repo)

**Files modified:**

- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — remove
  `save`, add `insert`/`update`.
- `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` —
  fake conformance test updated for `insert`/`update`; arity assertions updated.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` — `insert()`
  call site.
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` —
  `update()` call site with `existingEvent.updatedAt`.
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts`,
  `UpdateHazardousEvent.test.ts`, `DeleteHazardousEvent.test.ts`,
  `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
  `RecordSpatialObservation.test.ts` — each file's fake updated from `save` to
  `insert`/`update`.
- `_docs/refactoring-plan/deferred-items-register.md` — delete `DEF-035`/`DEF-037` once
  implemented (resolve-by-deletion); add a new, narrower `DEF-044` row for the remaining
  outgoing-`event_relationship`-role gap; `DEF-038`/`DEF-031` left untouched (inherited/
  still-open, not closed by this change).
- `app/drizzle/migrations/<timestamp>_relax_hazardous_event_hip_type_id.sql` (new) — see
  below.
- `app/drizzle/migrations/meta/_journal.json` — append-only entry for the new migration
  (mechanical, required for `drizzle-kit migrate` to recognize the file; not itself a
  schema or data change).
- `app/drizzle/schema/hazardousEventTable.ts` — the real (live) schema file, not just the
  PGlite `testSchema/` copy: `hipRelationColumnsRequired()` → `hipRelationColumnsOptional()`
  (an existing helper, already used by `disasterEventTable.ts`/`disasterRecordsTable.ts`),
  so `InsertHazardousEvent`'s TS type stops requiring `hipTypeId`, matching the migration's
  own nullable column. Found necessary during implementation, not anticipated when this
  proposal was first drafted.
- `app/backend.server/models/event.ts`, `app/backend.server/models/event/
  hazardous_event_get.ts` — one-line null-guards on `event.hipTypeId` before calling
  `getTypeById`, each matching the existing `hipHazardId`/`hipClusterId` guard pattern in the
  same function. This is exactly the residual risk design.md Decision 7 already names ("any
  live legacy read that assumes `hip_type_id` is always present") — surfaced here as a
  `yarn tsc` compile error once the column's TS type went nullable, not a new finding.

**DB migration required:** **Yes** (design.md Decision 7, confirmed): relax
`hazardous_event.hip_type_id` from `NOT NULL` to nullable — a single `ALTER TABLE
hazardous_event ALTER COLUMN hip_type_id DROP NOT NULL`, no data change, no drizzle-kit
push, via `yarn dbsync`. The four child tables
(`hazardous_event_hazard_driver`/`_attachment`/`_field_value`/`_custom_field_value`) need
no schema changes — confirmed via direct read, already exist with the shape `insert()`/
`update()` need.

**Test approach:** PGlite integration tier (`yarn test:run2`) under
`tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` — CRUD with tenant
isolation (an event created for tenant A is invisible from tenant B); child collections
persist and round-trip; `delete()` also removes the `event` supertype row and incoming
`event_relationship` rows; mandatory concurrent-callers scenario for `update()`'s CAS
guard (two concurrent updates against the same stale read — the loser rejects with
`ConcurrentModificationError`). Unlike `5i`'s advisory-lock races, this concurrency
guarantee is enforced by the conditional `UPDATE ... WHERE updated_at = ?` predicate
itself, not by a lock PGlite's single-connection transaction model could mask — PGlite is
expected to be sufficient here, the same way it was for `5j`'s identical mechanism against
`IWorkflowRepository`; this is confirmed empirically in tasks.md (remove the predicate,
confirm the test fails) rather than assumed. Existing Vitest unit-test tiers for
`CreateHazardousEventUseCase`/`UpdateHazardousEventUseCase` are updated for the new port
shape. No E2E — no route wiring exists yet (`5g`/later).

**Security / multi-tenancy implications:** `findById`/`findAll`/`delete` are tenant-scoped
via `eq(hazardousEventTable.countryAccountsId, tenantId)`, matching Notices' precedent.
`delete()`'s tenant gate is enforced via a `RETURNING`-checked `DELETE ... WHERE id = ? AND
country_accounts_id = ?` on the `hazardous_event` row itself, before any supertype/
relationship cleanup runs — a foreign-tenant `id` therefore touches nothing (see design.md
Decision 6; a new cross-tenant delete spec scenario covers this explicitly, since the
legacy function's own existence pre-check and its deleting transaction are two separate
steps, not one atomic gate). `insert()`/`update()` carry tenancy via the entity's own
`tenantId` property, per the port's existing contract — no separate parameter.
