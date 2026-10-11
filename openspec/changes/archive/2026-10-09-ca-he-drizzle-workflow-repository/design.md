## Context

See `proposal.md` — Why. Relevant current state:

- `IWorkflowRepository` (`app/domains/validation-workflow/application/ports/IWorkflowRepository.ts`,
  `3a`) declares four methods: `findByEntity`, `findByEntityIds`, `save`, `deleteByEntity`. None
  accept `tenantId`.
- `workflowInstanceTable` (`app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`,
  `2a`) has primary key `id`, a `UNIQUE(entity_id, entity_type)` index, `CHECK` constraints
  mirroring `ENTITY_TYPE_VALUES`/`STATUS_VALUES`, four `{action}ByUserId`/`{action}At` attribution
  column pairs each `references(() => userTable.id)`, and no `country_accounts_id` column.
- `WorkflowInstance.create()` (`app/domains/validation-workflow/domain/WorkflowInstance.ts`, `3a`)
  validates: non-empty `entityId`; `entityType`/`status` are valid enum members; every `*At` field
  is either `null` or a valid `Date`; each attribution pair (`submittedByUserId`/`submittedAt`,
  etc.) is both-null-or-both-set; and each `status`'s `REQUIRED_SET`/`REQUIRED_NULL` attribution
  shape (e.g. `PUBLISHED` requires all four pairs set, `APPROVED` requires `submitted`+`approved`
  set and `published` null). A row violating any of these throws `ValidationError` when mapped
  through `create()`.
- Six real consumers already call this port against hand-written fakes:
  `ProcessWorkflowActionUseCase` (`findByEntity`, `save`), `CreateHazardousEventUseCase` (`save`
  only — always a fresh `DRAFT` via `WorkflowInstance.createDraft()`), `GetHazardousEventByIdUseCase`
  (`findByEntity`, throws `NotFoundError` on `null`), `ListHazardousEventsUseCase`
  (`findByEntityIds` only, confirmed via its own test to call it exactly once per page, never
  `findByEntity` in a loop), `UpdateHazardousEventUseCase` (`findByEntity`, throws `NotFoundError`
  on `null`), `DeleteHazardousEventUseCase` (`deleteByEntity` only, before the aggregate's own
  `delete()`).
- Precedent adapters: `DrizzleNoticeRepository.server.ts` (`app/domains/notices/infrastructure/`)
  is the only existing adapter with a `save()` upsert — `ON CONFLICT (id) DO UPDATE`, a tenant-scoped
  `WHERE` guard on the conflict branch, empty-`RETURNING`-means-guard-failed mapped to
  `ConflictError`, and a `23505`-unique-violation catch also mapped to `ConflictError`.
  `DrizzleEventCausalityRepository.server.ts` (`app/domains/event-causality/infrastructure/`,
  `5m`, 2026-10-08) is the freshest adapter in this lineage and the one ADR-009 itself cites for
  two now-codified conventions this change follows without re-litigating: (a) `.server.ts` suffix
  only when a file transitively imports browser-unsafe code; (b) a port-adapter's own integration
  test lives at `tests/integration/domains/<context>/`, importing test setup via
  `import "../../db/setup"` (two levels up from that folder to `tests/integration/db/setup.ts`) —
  confirmed by reading `tests/integration/domains/event-causality/DrizzleEventCausalityRepository.test.ts`
  itself, not assumed from the general `./setup`/`../setup` rule written before this convention
  existed. The roadmap's own stated test path for `5a`
  (`tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`) already
  matches this convention.
- `tests/integration/db/models/hazardousEventTestHelpers.ts` exports `seedUser()` (inserts a row
  into `userTable`, returns its id) and `seedCountryAccount()` — both reusable here even though
  this adapter itself never touches `country_accounts_id`, because the attribution columns'
  `references(() => userTable.id)` FK means a transition round-trip test needs a real seeded user.
  `entityId` carries no FK of its own (polymorphic, `2a` Decision 1), so a random UUID is valid
  there without seeding anything.
- **Phase M status, checked this session:** no `Ma` branch, no backfill script, under
  `scripts/dts_database/` exists yet. `DEF-031` already documents that `GetHazardousEventByIdUseCase`/
  `UpdateHazardousEventUseCase` throwing `NotFoundError` on a missing `WorkflowInstance` is a
  pre-Phase-M-backfill gap affecting every real adapter/route built before Phase M runs — this
  change is exactly such an adapter, so it inherits that already-documented risk without needing a
  new entry. Phase M itself is a separate, parallel workstream.
- **`DEF-035`'s own mention of `5a`:** found via the deferred-items register. It only confirms a
  boundary already reflected in `DeleteHazardousEventUseCase`'s call order — this adapter's
  `deleteByEntity` supersedes the legacy transaction's validation-row cleanup step; the
  `hazardous_event`/`event_relationship`/`event` row cleanup is `5d`'s own separate scope. No new
  scope for this change.
- Checked `_docs/refactoring-plan/deferred-items-register.md` in full: no open row is scoped
  specifically against `5a` beyond `DEF-024`/`DEF-031`/`DEF-035`, all already accounted for above.

## Goals / Non-Goals

**Goals:**

- A `DrizzleWorkflowRepository` that six existing use cases can be wired to without any of their
  own existing tests changing shape (same error types, same null/array semantics, same ordering
  of calls already asserted against their fakes).
- Every method's `entityType` filter is proven correct by seeding the same `entityId` under two
  different `entityType`s and asserting cross-type isolation — not merely trusting the WHERE
  clause compiles.
- `findByEntityIds` is proven to issue exactly one SQL statement regardless of batch size.

**Non-Goals:**

- No tenant filter — out of scope by the port's own documented contract (see Context).
- No module wiring (`ValidationWorkflowModule`, DI registration) — `5c`.
- No optimistic locking / lost-update protection on `save()` — `DEF-024`, targeted at `5j`. This
  change's own test suite characterizes the current (unprotected) behavior rather than fixing it.
- No change to any of the six consumers' own use-case code or tests.
- No Form-CSV-API / `fieldsDef` impact — this is a pure persistence adapter with no presentation
  surface.

## Decisions

**Decision 1 — Upsert target is the primary key `id`, not `(entity_id, entity_type)`.**
Every real call path either (a) saves a brand-new `WorkflowInstance` with a freshly-generated
`id` for an `entityId` that has never had one before (`CreateHazardousEventUseCase`,
`WorkflowInstance.createDraft()`), or (b) saves a `WorkflowInstance` whose `id` was already loaded
from a prior `findByEntity()` call and whose `entityId`/`entityType` are immutable after
construction (`ProcessWorkflowActionUseCase`, every transition method returns a `new
WorkflowInstance({...this.props, ...patch})` carrying the same `id`/`entityId`/`entityType`).
`save()` is therefore `INSERT ... VALUES (...) ON CONFLICT (id) DO UPDATE SET ...`, matching
`DrizzleNoticeRepository.save()`'s own upsert shape.
_Alternative considered:_ upsert on `(entity_id, entity_type)` instead — rejected because it would
silently let an update caller's own `id` field reassign a different row's primary key on conflict,
a stranger failure mode than the one being guarded against.

**Decision 2 — The `DO UPDATE SET` clause persists the domain's own `updatedAt` as given; it does
not use a DB-side `CURRENT_TIMESTAMP`.**
Unlike `DrizzleNoticeRepository.save()` (which deliberately uses `sql`CURRENT_TIMESTAMP`` on
conflict), `WorkflowInstance`'s own design (`3a` Decision 5) explicitly rejects an internally-read
clock — every transition method takes `now` as an explicit parameter precisely so
`ProcessWorkflowActionUseCase`'s `validate()+approve()` composition can stamp `validatedAt`,
`approvedAt`, and `updatedAt` from one single shared `now` value (already asserted by
`ProcessWorkflowAction.test.ts`'s "stamping validatedAt === approvedAt from one shared now" case).
A DB-side timestamp would silently diverge the persisted `updatedAt` from the `updatedAt` already
present on the entity passed to `save()`, breaking that guarantee the moment the returned,
re-mapped entity is compared against the pre-save one. `entityId`, `entityType`, and `createdAt`
are excluded from the `SET` clause (immutable after creation).
_Alternative considered:_ `DrizzleNoticeRepository`'s `CURRENT_TIMESTAMP` pattern — rejected for
the reason above; this is a real, not cosmetic, difference between the two entities' clock-
ownership models.

**Decision 3 — An identity-mismatch guard on the conflict branch, mirroring `DrizzleNoticeRepository`.**
The `ON CONFLICT (id) DO UPDATE` carries a `WHERE entity_id = :entityId AND entity_type =
:entityType` guard, same shape as Notice's own tenant guard. If a caller's `id` collides with an
existing row belonging to a *different* `(entityId, entityType)` — not reachable through any of
the six real consumers today, since none ever mutates an already-loaded instance's identity, but
cheap defense-in-depth against a future caller bug — the guard fails, `RETURNING` is empty, and
the adapter throws `ConflictError` rather than silently keeping the old row's identity and
returning a mismatched entity.

**Decision 4 — The first-insert-race unique-violation on `(entity_id, entity_type)` is mapped to
`ConflictError`, but the error-shape check is verified empirically against this codebase's actual
Postgres driver, not copied from `DrizzleNoticeRepository`'s own `err.code === "23505"` check.**
Phase 0's own audit (`0a`, roadmap Invariant 1) found a confirmed, live bug in this exact area:
HE's legacy dependent-delete catch checks `error?.code`, but the real Postgres error code surfaces
nested under `error.cause.code` — the shallow check is dead code. `app/backend.server/models/common.ts`
line 148 (`constraintPGCodeToType(err.code || err.cause?.code)`) is the one place in this codebase
that already checks both, confirming the nested shape is the one that actually occurs at runtime
here. `DrizzleNoticeRepository.save()`'s own `err.code === "23505"` check may be exactly the same
latent bug, just never triggered by a failing test — out of scope to fix in this change, but
flagged below rather than silently inherited. This adapter's own catch checks both `err.code` and
`err.cause?.code` (matching `common.ts:148`'s own both-fields pattern exactly, narrowed from
`unknown` via an explicit `typeof`/`in` guard — never `as any`, per this project's own
never-use-`as any` rule) and a dedicated PGlite test drives a real `(entity_id, entity_type)`
unique-violation (two `save()` calls, different `id`s, same `entityId`/`entityType`) to prove the
mapping fires against PGlite's own driver. **Scope of what this actually proves:**
`common.ts:148` checking both fields does not by itself reveal which one is populated in this
codebase's production path — only that checking both is the established, safe pattern. The PGlite
test confirms the error shape for PGlite specifically; production `dr` is `node-postgres`
(`drizzle-orm/node-postgres`), a different driver. Checking both fields is correct regardless of
which driver is live, so this is not a gap in the fix — only a scope note on what the PGlite test
can and cannot prove by itself.
_Resolved beyond the PGlite test, outside this suite:_ ad hoc scripts run directly against both
drivers (via the exact `insert().onConflictDoUpdate().returning()` call shape used here, including
against this machine's real local Postgres through `drizzle-orm/node-postgres`) confirm both raise
`DrizzleQueryError` with the real Postgres code under `.cause.code`, never top-level `.code` — so
in practice only the `.cause.code` branch is ever live for this call shape on either driver.
_Flag for the user, not fixed here:_ `DrizzleNoticeRepository.save()`'s `23505` catch should be
independently checked for the same `error.cause.code` nesting bug — out of this change's scope
(different bounded context, different file), but worth a follow-up `DEF-xxx` entry if confirmed.

**Decision 4b (added after review) — `save()`'s catch also maps `23503` (foreign-key violation, an
attribution user id referencing a nonexistent user) and `22P02` (invalid input syntax, e.g. a
non-UUID `entityId`) to `ValidationError`, using the same `pgErrorCode()` dual-field extraction as
Decision 4's `23505`→`ConflictError` mapping.** Both codes represent bad input data, not a resource
conflict, so `ValidationError` is the ADR-003-consistent choice. Without this, either error escaped
as a raw, unmapped `DrizzleQueryError` — a real gap, not a deferred one, since every attribution
column carries a real `references(() => userTable.id)` FK and every `entityId` column is typed
`uuid` with no application-level format check. Both codes are proven via a dedicated PGlite test
each, same rigor as the existing `23505` test.

**Decision 5 — `findByEntityIds([], entityType)` short-circuits before querying.**
Empirically confirmed against the installed `drizzle-orm@0.45.2`: `inArray(column, [])` already
compiles to `WHERE false` (not a thrown error), so this is a performance optimization, not a
correctness requirement — `ListHazardousEventsUseCase` already guards `events.length > 0` before
calling, so this path is only reachable from a future caller that skips that guard. Returning `[]`
immediately avoids an always-empty round trip.

**Decision 6 — Query-count verification spies on the underlying PGlite client's own `query`
method, not an invented counting layer.** No existing precedent for literal SQL-statement
counting exists in this codebase's PGlite tests. Confirmed empirically by reading
`node_modules/drizzle-orm/pglite/session.cjs`: every statement Drizzle's `pglite` driver executes
calls `client.query(queryString, params, ...)` exactly once per round trip. The test file spies on
`dr.$client.query` (`vi.spyOn`; no cast needed — `Dr.$client` is already typed `any`) around the
`findByEntityIds` call and asserts
`toHaveBeenCalledTimes(1)` for a multi-id batch — directly proving "one batched query, not a loop"
rather than only proving "the result happens to be correct" (a looped `findByEntity`-per-id
implementation would still pass a result-only assertion).

**Decision 7 — Row-to-entity mapping goes through `WorkflowInstance.create()` for both methods,
but `findByEntityIds` skips and logs an invariant-violating row instead of letting the error
propagate; `findByEntity` still throws. (Resolved — see Open Questions for the full reasoning.)**
Every mapped row is passed through `WorkflowInstance.create()` (never a bypassing constructor).
For `findByEntity` (single-row), a thrown `ValidationError` propagates normally, matching
`DrizzleNoticeRepository.toEntity()`'s own precedent — the caller is already in an exceptional
lookup path and must handle a thrown error regardless. For `findByEntityIds` (list/batch), the
mapping is wrapped per-row: a row that throws is caught, a structured WARN log is emitted via
`getPinoLogger()` (recording the offending `entityId`/`entityType` and the caught error — same
direct-call pattern `NoticesModule.server.ts` already uses to obtain a logger without a NestJS DI
token, since this adapter has no `ILogger` constructor dependency and adding one would require DI
wiring that is `5c`'s scope, not this change's), and the row is omitted from the returned array —
the same way a genuinely missing row is already omitted under this port's own existing contract.
**The catch narrows to `instanceof ValidationError` specifically — not a bare `catch { skip }` —
and this is the complete, deliberate set, not a partial one left open for future broadening.**
`WorkflowInstance.create()` does no lookups, auth checks, or conflict checks; structurally, the
only one of ADR-003's four domain error types it can ever throw is `ValidationError`. Narrowing to
exactly that type already covers every error this call site can legitimately produce. Anything
else reaching this catch would mean the reconstruction logic itself is broken (a bug in
`toProps()`/`create()`, not a bad row) — which would likely affect every row, not just one — and
must propagate loudly per ADR-003, not be silently skipped alongside genuine invariant violations.

**Why `findByEntityIds` gets different treatment, not `findByEntity` too:**
`ListHazardousEventsUseCase` (`findByEntityIds`'s sole consumer) already tolerates a *missing*
`WorkflowInstance` for one event in a page by reporting `workflowStatus: null` for that row alone
(`DEF-031`), not by failing the whole page. An invariant-violating row is the same category of
"this one event's workflow status cannot be reported right now" from that consumer's point of
view — treating it identically (omit, don't fail the batch) is consistent with that
already-accepted precedent, not a new carve-out invented for this change. `findByEntity`'s own
callers (`GetHazardousEventByIdUseCase`, `UpdateHazardousEventUseCase`) have no equivalent
graceful-degradation path — both already throw `NotFoundError` on a `null` result, so there is no
precedent for tolerating a bad row there either, and a single-entity lookup failing loudly remains
correct.

## Risks / Trade-offs

- **[Risk] `DEF-024`'s lost-update gap is real and this change does not fix it.** Two concurrent
  `save()` calls against the same existing row (e.g. two admins approving and returning the same
  `WorkflowInstance` near-simultaneously) will both succeed, last-write-wins, with no error to
  either caller. → **Mitigation:** this change's own test suite includes a dedicated scenario
  proving this exact behavior (not silently passing by accident), explicitly labeled as
  characterizing `DEF-024` so `5j`'s own optimistic-locking work has a concrete pre-fix baseline
  to compare against.
- **[Risk] A `deleteByEntity()` followed by a stale, already-in-flight `save()` for the same
  entity can silently resurrect the just-deleted row.** Distinct from the save/save interleaving
  above (same root cause — no version/tombstone mechanism — different trigger): once the row
  `deleteByEntity()` removed is gone, a `save()` call issued before the delete but completing after
  it finds no conflicting row and simply inserts, recreating the entity with stale data and no
  error to either caller. → **Mitigation:** not fixed here — this change does not add a tombstone
  or version check, matching `DEF-024`'s own accepted scope. `DEF-024`'s register row is widened to
  describe this interleaving explicitly, alongside the two save/save ones, so `5j`'s design covers
  all three rather than only the ones originally named.
- **[Risk] Attribution-pair invariant violations in a persisted row are only caught at read time,
  not write time, for any non-domain-constructed write path.** Every real consumer in this change's
  own scope only ever persists domain-constructed instances (`WorkflowInstance.create()` /
  `.createDraft()` / the transition methods), so this is unreachable through this change's six
  consumers today. It becomes reachable the moment Phase M's backfill (a separate, parallel
  workstream, not yet started per this session's check) writes rows directly via SQL. →
  **Mitigation (resolved — Decision 7):** `findByEntityIds` skips and logs such a row rather than
  failing the whole batch; `findByEntity` still throws. The skip is logged at WARN via
  `getPinoLogger()` so the anomaly stays observable even though it no longer breaks a list page —
  this is a deliberate trade-off (availability over fail-loud) for the list path specifically, not
  a blanket "swallow bad data" policy.
- **[Risk] `DrizzleNoticeRepository`'s own `23505` catch may share HE's `0a`-confirmed
  `error.cause.code` nesting bug.** → **Mitigation:** not fixed here (different bounded context);
  flagged in Decision 4 for a follow-up check — the user should decide whether this warrants a new
  `DEF-xxx` row in the deferred-items register (outside this change's own edit boundary).
- **[Risk] The "concurrent callers" scenarios in this change's spec are not a proof of real
  concurrency safety.** PGlite (used by `yarn test:run2`) serializes all queries over a single
  connection, so two `save()`/`deleteByEntity()` calls issued "concurrently" in a test are really
  a deterministic, interleaved ordering chosen by the test, not true parallel execution against
  independent connections. → **Mitigation:** this is still a meaningful test — it pins the exact
  outcome of a real ordering (one commits, the next sees the committed state) — but it does not
  by itself prove behavior under genuine multi-connection concurrency against real Postgres. Real
  Postgres is expected to produce the same outcomes here (the second insert blocks on the first's
  row lock, then evaluates the unique constraint and fails with `23505`), but that is an
  expectation carried over from Postgres's own documented locking behavior, not something this
  change's PGlite-only test suite itself demonstrates end-to-end.

## Migration Plan

No deploy-time migration, no rollback script — this is a code-only, same-PR-reversible change (a
plain `git revert` undoes it cleanly; `workflow_instance` itself is untouched).

1. Add `DrizzleWorkflowRepository.server.ts` implementing `IWorkflowRepository`.
2. Add `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` (PGlite).
3. No other file changes — no consumer, no module, no schema file is touched.

## Open Questions

None remain. The three items originally flagged here are resolved:

**1. Row-invariant-failure handling — resolved: option (b), skip and log.**
When a row returned by `findByEntityIds` fails `WorkflowInstance.create()`'s own invariant
validation (e.g. a `PUBLISHED` row missing `validatedByUserId`, reachable only via a
non-domain-validated write path such as Phase M's future backfill, not through any of this
change's six real consumers today), the adapter skips that row (omitting it from the result,
logged at WARN) rather than letting the error propagate and fail the entire batch.
`findByEntity` still throws — a single direct lookup failing loudly is correct there, and none of
its own callers (`GetHazardousEventByIdUseCase`, `UpdateHazardousEventUseCase`) have a
graceful-degradation path the way `ListHazardousEventsUseCase` already does. See Decision 7 for
the full reasoning, which rests on `DEF-031`'s already-accepted precedent that a *missing*
`WorkflowInstance` is tolerated per-row (`workflowStatus: null`) rather than failing the page — an
invariant-violating row is the same category of incomplete data from that same consumer's point
of view, so treating it identically is consistent with existing precedent, not a new carve-out.
Reflected in the spec delta's dedicated scenario and in `tasks.md`'s task 2.1/3.1.

**2. Capability-spec shape — resolved: standardized on `event-causality-repository-port`'s
precedent (`5m`).** This change's new requirements are added as a Modified delta against the
existing `workflow-repository-port` spec (`specs/workflow-repository-port/spec.md` within this
change), not a new, separate `drizzle-workflow-repository` capability.
`drizzle-notice-repository`'s own precedent (a dedicated adapter-level spec) is the older,
pilot-era shape and is not followed here going forward.

**3. `DrizzleNoticeRepository`'s own possible `error.cause.code` nesting bug — resolved: no
action in this change.** Left as an informational note only (Decision 4) — not fixed here
(different bounded context, out of this change's file scope), and no deferred-items-register
entry is added as part of this change. This adapter's own dual-field check
(`err.code`/`err.cause?.code`) stands as the correct approach going forward regardless of whether
Notice's own single-field check is ever revisited.
