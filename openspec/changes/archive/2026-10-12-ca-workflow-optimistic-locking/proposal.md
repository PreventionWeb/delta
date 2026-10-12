## Why

`DrizzleWorkflowRepository` (`5a`) has no lost-update protection. Two callers racing off
the same stale read produce silent last-write-wins (e.g. a stale `'return'` overwriting an
already-`PUBLISHED` row) — this is already reachable in production via `4a`'s
`ProcessWorkflowActionUseCase`, and is explicitly characterized (not yet fixed) by an
existing integration test. `5a`'s own review additionally found a second interleaving: a
`deleteByEntity()` followed by a stale, already-in-flight `save()` silently resurrects the
just-deleted row. This closes `DEF-024`, narrowed on 2026-10-12 to the one real adapter
that exists (`DrizzleWorkflowRepository`); the identical race on the not-yet-built
`IHazardousEventRepository` adapter is tracked separately as `DEF-037`, owned by `5d`.

## What Changes

- **BREAKING**: `IWorkflowRepository.save(instance)` is replaced by two explicit methods:
  `insert(instance)` for first-time persistence and `update(instance, expectedUpdatedAt)`
  for persisting a transition against a previously-read row. Splitting the single upsert
  into two intention-revealing methods (rather than keeping one `save()` with an optional
  "expected" parameter) is deliberate: an optional parameter that callers can omit would
  silently fall back to today's unguarded upsert and reopen `DEF-024` with no compile-time
  signal. `update()`'s `expectedUpdatedAt` parameter is required.
- `update()` performs a plain conditional `UPDATE ... WHERE id = ? AND entity_id = ? AND
  entity_type = ? AND updated_at = ?` (not an upsert) — it never inserts. This is also what
  closes the delete/save resurrection race: once the row search space for `update()` no
  longer includes "insert if absent," a `deleteByEntity()` that races ahead of a stale
  `update()` simply leaves it matching zero rows, the same as any other conflict. No
  tombstone or schema change is needed for this case (see design.md Decision 2).
- `insert()` keeps today's existing behavior for first-time persistence (a plain `INSERT`,
  relying on the existing `UNIQUE(entity_id, entity_type)` constraint for
  first-insert-race `ConflictError`, unchanged from today).
- A zero-row result from `update()` now needs to distinguish three causes that a single
  `ConflictError` message cannot conflate: (a) the id belongs to a different entity
  (today's existing Decision 3 guard), (b) the row still exists for this entity but
  `updated_at` no longer matches (a genuine lost-update race), (c) the row no longer
  exists at all (a concurrent delete raced ahead). A new `ConcurrentModificationError
  extends ConflictError` (in `~/shared/errors`, reusable by `DEF-037`'s future adapter) is
  thrown for (b) and (c); the existing entity-mismatch message is preserved for (a). A
  non-atomic diagnostic re-read by `id` after a zero-row result distinguishes the three
  (design.md Decision 4).
- `ProcessWorkflowActionUseCase.execute()` now reads `existing.updatedAt` (already
  available from its own `findByEntity()` read) and passes it to
  `workflowRepository.update(transitioned, existing.updatedAt)`. Decided 2026-10-12
  (design.md Decision 6): `execute()` propagates `ConcurrentModificationError` unmodified,
  matching every other `update()` error — no retry loop.
- `CreateHazardousEventUseCase.execute()` calls `workflowRepository.insert(workflowInstance)`
  instead of `save()` for its first-time `WorkflowInstance.createDraft()` write — no
  behavior change for this call site, signature only.
- The existing integration test that explicitly "characterizes DEF-024" (silent
  last-write-wins) is inverted: the losing concurrent `update()` call must now reject with
  `ConcurrentModificationError`, not silently succeed.

## Capabilities

### New Capabilities

(none — this closes a known gap in existing capabilities, it does not introduce a new one)

### Modified Capabilities

- `workflow-repository-port`: `IWorkflowRepository.save()` is replaced by `insert()`/
  `update()`; `update()` gains optimistic-locking semantics (conditional `UPDATE`, new
  `ConcurrentModificationError`, concurrent-callers scenarios for both the save/save and
  delete/save races); `DrizzleWorkflowRepository`'s own requirements are updated to match.
- `process-workflow-action`: `ProcessWorkflowActionUseCase` calls `update()` with the
  previously-read `updatedAt` instead of `save()`; it propagates
  `ConcurrentModificationError` unmodified (design.md Decision 6).
- `create-hazardous-event`: `CreateHazardousEventUseCase` calls `insert()` instead of
  `save()` for its `WorkflowInstance` write (signature-only; several existing scenarios in
  this spec reference `IWorkflowRepository.save` by name and need updating to `insert`).

## Impact

**Files touched:**

- `app/domains/validation-workflow/application/ports/IWorkflowRepository.ts` — replace
  `save()` with `insert()`/`update()`.
- `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` —
  implement `insert()`/`update()`; `update()`'s conditional `UPDATE` + diagnostic re-read.
- `app/shared/errors/DomainError.ts` (or a new file in `app/shared/errors/`) — add
  `ConcurrentModificationError extends ConflictError`.
- `app/shared/errors/index.ts` — export the new error.
- `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts` —
  call `update()` with `existing.updatedAt`; propagates `ConcurrentModificationError`
  unmodified (design.md Decision 6).
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` — call
  `insert()` instead of `save()`.
- Test fakes implementing `IWorkflowRepository` across
  `CreateHazardousEvent.test.ts`, `DeleteHazardousEvent.test.ts`,
  `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`,
  `UpdateHazardousEvent.test.ts`, `ProcessWorkflowAction.test.ts`,
  `IWorkflowRepository.test.ts` — update mock `save` to `insert`/`update`.
- `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` —
  invert the existing DEF-024-characterizing test; add new conflict/concurrency scenarios.
- `_docs/refactoring-plan/deferred-items-register.md` — close `DEF-024` once implemented
  (implementer's task, not performed by this proposal).

**DB migration required:** No. The fix reuses the existing `updated_at` column as the
optimistic-lock token (no new `version` column) — see design.md Decision 3 for the
precision risk this carries and how it's mitigated without a schema change.

**Test approach:** PGlite integration tier (`yarn test:run2`) for
`DrizzleWorkflowRepository`'s own conflict detection (mandatory concurrent-callers
scenarios for both races); existing Vitest unit tests for `ProcessWorkflowActionUseCase`
and `CreateHazardousEventUseCase` updated for the new port shape and (once decided) the
new error-reaction behavior.

**Security / multi-tenancy implications:** None. `workflowInstanceTable` carries no
`countryAccountsId` by design (`3a` Decision 2); this change does not alter that boundary
or add one.

**Decided (2026-10-12, see design.md Decisions 6-7):** `ProcessWorkflowActionUseCase`
propagates `ConcurrentModificationError` unmodified (no retry loop); the no-tombstone
resolution of the delete/save resurrection race is accepted as-is.
