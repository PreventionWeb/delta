## 0. Resolve open design questions with the user (blocking — see proposal.md and design.md)

- [x] 0.1 Resolved: design.md Decision 7 (`hazardous_event.hip_type_id` is `TEXT NOT NULL`
      with no default; the CA entity carries no HIP field at all — confirmed via direct
      read of the initial migration and every later migration touching this table, not
      assumed) is confirmed as Option A (migrate the column to nullable). The
      crosswalk-based alternative (Option B, via `hazard_type.sourceRefId`) was considered
      and rejected — real added complexity (a join dependency, a new nullable-`sourceRefId`
      failure mode) to solve a problem a one-line migration already solves cleanly. Section
      1 and Section 5 below use this resolution.
- [x] 0.2 Resolved: design.md Decision 8 (the `event_relationship` outgoing-role gap
      `DEF-035` still describes) is confirmed as Option B (inherit the gap, map the
      resulting `23503` to `ConflictError`). Section 7 below and the
      `hazardous-event-repository-port` delta spec's "A pre-existing outgoing
      event_relationship row..." scenario already reflect this resolution.
- [x] 0.3 Confirmed: design.md Decision 2 (`expectedUpdatedAt: Date | null`, deviating from
      `5j`'s non-nullable `Date`) is accepted as the interface shape — `HazardousEvent.
      updatedAt`'s own `Date | null` type leaves no real alternative; recorded here per
      this change's standing instruction that a `5j`-precedent deviation must be surfaced
      explicitly, not silently implemented.

## 1. Migration (Task 0.1's resolution — Option A)

- [x] 1.1 Write `app/drizzle/migrations/<timestamp>_relax_hazardous_event_hip_type_id.sql`:
      `ALTER TABLE hazardous_event ALTER COLUMN hip_type_id DROP NOT NULL;` with a
      `--> statement-breakpoint` if any further statement is added. Update
      `tests/integration/db/testSchema/` to match, per this repo's standing convention for
      any column-constraint change (not just additions). Verify: `yarn dbsync` applies
      cleanly against a local/test database with no error.
- [x] 1.2 Confirm no existing PGlite test schema or fixture assumes `hip_type_id` is always
      populated for a row this change's own new tests will create. Verify: existing
      `yarn test:run2` suite (baseline, before any other change in this proposal) still
      passes after Task 1.1 alone.

## 2. Port interface — insert()/update() replacing save()

- [x] 2.1 Update `app/domains/hazardous-events/application/ports/
      IHazardousEventRepository.test.ts`: replace `FakeHazardousEventRepository.save()`
      with `insert(entity)` (plain write, rejects on an id collision, matching the delta
      spec's "An id collision on insert is rejected" scenario) and `update(entity,
      expectedUpdatedAt: Date | null)` (for this interface-conformance fake, an in-memory
      equality check against the stored entity's own `updatedAt`, including the `null`
      branch per the delta spec's "An expectedUpdatedAt of null matches a row that has
      never been updated" scenario — the real conditional-SQL/CAS behavior is the adapter's
      own concern, covered in Section 6). Update every `repo.save(...)` call site in this
      file to `repo.insert(...)`. Replace the `_saveArity` compile-time assertion with
      `_insertArity` and `_updateArity` (the latter asserting `expectedUpdatedAt: Date |
      null` is a required second parameter). Add tests for
      `ConcurrentModificationError` on a stale `update()` call and on an `update()` racing
      behind a `delete()`. Verify: `yarn vitest run app/domains/hazardous-events/
      application/ports/IHazardousEventRepository.test.ts` fails to typecheck/run
      (interface doesn't exist yet).
- [x] 2.2 Update `app/domains/hazardous-events/application/ports/
      IHazardousEventRepository.ts`: remove `save()`, add `insert(entity: HazardousEvent):
      Promise<HazardousEvent>` and `update(entity: HazardousEvent, expectedUpdatedAt: Date |
      null): Promise<HazardousEvent>`, per the `hazardous-event-repository-port` spec
      delta's "insert persists a brand-new HazardousEvent..." and "update persists a
      change against a previously-read HazardousEvent..." requirements. Verify: `yarn
      vitest run app/domains/hazardous-events/application/ports/
      IHazardousEventRepository.test.ts` passes, and `yarn tsc` reports errors only in
      files not yet updated (expected — resolved by Sections 8-9).

## 3. DrizzleHazardousEventRepository — scaffold, findById

- [x] 3.1 Write failing PGlite tests in `tests/integration/db/queries/
      DrizzleHazardousEventRepository.test.ts` (`import "../setup"`, matching this
      domain's existing adapter test location — `DrizzleCausalChainRepository.test.ts`/
      `DrizzleHazardTaxonomyRepository.test.ts` sibling precedent, correcting the
      roadmap's stale `tests/integration/domains/hazardous-events/` path) covering
      `findById`: resolves a persisted entity's full shape including all four child
      collections; throws `NotFoundError` for a missing id; throws `NotFoundError` for a
      foreign-tenant id (not a cross-tenant leak); propagates `ValidationError` unmodified
      for a row that fails rehydration (seed a row with an invalid value directly via
      `db.insert`, bypassing the adapter, per the delta spec's own scenario). Verify red:
      `yarn vitest run tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts`.
- [x] 3.2 Implement `DrizzleHazardousEventRepository` (`app/domains/hazardous-events/
      infrastructure/DrizzleHazardousEventRepository.server.ts`, `@Injectable()`,
      `@Inject(DRIZZLE_CLIENT) private readonly db: Dr`, matching
      `DrizzleHazardTaxonomyRepository`'s/`DrizzleCausalChainRepository`'s own class
      shape) with a `toProps`/`toRow` mapping covering exactly `HazardousEventProps`'s
      fields (explicitly excluding the legacy approval-status/HIP-hierarchy/legacy
      `attachments` JSONB columns — design.md Context/Decision 4) and `findById` querying
      `hazardous_event` joined/batched against all four child tables for one id. Verify
      green: Task 3.1's tests pass.
- [x] 3.3 Refactor: extract the row-to-child-collections assembly into a private method
      reusable by Task 4's `findAll`, keeping Task 3.1's tests green.

## 4. DrizzleHazardousEventRepository — findAll

- [x] 4.1 Write failing tests: tenant isolation (entity for tenant A invisible from tenant
      B); pagination (page/pageSize slicing); deterministic ordering (repeated calls with
      unchanged data return the same order — delta spec's "Repeated calls with the same
      pagination..." scenario); a row that fails rehydration is skipped with a logged
      warning, not thrown, and does not affect other rows on the page (delta spec's own
      scenario, seeded the same way as Task 3.1's rehydration-failure row). Verify red.
- [x] 4.2 Implement `findAll`: tenant-scoped, paginated, `ORDER BY created_at, id` (stable
      tiebreaker), batching each child table's load via `inArray` across the page's ids
      (not per-row queries), catching only `ValidationError` from a single row's
      `HazardousEvent.create()` call and logging+skipping it, matching
      `DrizzleWorkflowRepository.findByEntityIds`'s exact precedent (anything other than
      `ValidationError` propagates). Verify green: Task 4.1's tests pass.
- [x] 4.3 Refactor, keeping all tests green.

## 5. DrizzleHazardousEventRepository — insert() (depends on Section 1's migration)

- [x] 5.1 Write failing tests: a brand-new entity with non-empty values in all four child
      collections round-trips exactly through a subsequent `findById` (delta spec's own
      scenario); an entity with every child collection empty persists with no child rows
      and no malformed-empty-insert error; an id collision on `insert()` is rejected, not
      silently overwritten. Verify red.
- [x] 5.2 Implement `insert()`: one transaction — insert the `event` supertype row (`{ id:
      entity.id }`, relying on `name`/`description`'s own DB defaults), the
      `hazardous_event` row (only the domain-mapped columns; the legacy `attachments`
      JSONB column and every approval/HIP column are left to their own DB defaults or
      `NULL` — design.md Decision 4), then each non-empty child collection as its own
      batched `.values([...])` insert, skipping any empty collection entirely (`.values([])`
      is a malformed call, not a no-op, on this driver). Verify green: Task 5.1's tests
      pass.
- [x] 5.3 Refactor: extract the four child-collection insert calls into a shared private
      helper reusable by Task 6's `update()`. Keep all tests green.

## 6. DrizzleHazardousEventRepository — update() with optimistic locking (depends on Task 0.3)

- [x] 6.1 Write a failing test for the benign case: a normal single-writer `update()` with
      a matching `expectedUpdatedAt` (including the `null`-token case for an event never
      updated before — delta spec's own scenario) persists the change and fully replaces
      all four child collections. Verify red.
- [x] 6.2 Write a failing **mandatory concurrent-callers** test: two concurrent `update()`
      calls against the same row, both computed from the same previously-read
      `expectedUpdatedAt`, invoked before either resolves — assert exactly one resolves,
      the other rejects with `ConcurrentModificationError`, and the final persisted state
      (scalars and all four child collections) matches only the winner, with no
      interleaving (delta spec's own mandatory scenario). This test MUST fail before Task
      6.3's implementation (no CAS guard yet) — confirm the race actually reproduces (both
      calls succeeding) before implementing the fix.
- [x] 6.3 Write a failing test for the delete/update resurrection race: a `delete()` that
      completes before a stale `update()` for the same id is rejected with
      `ConcurrentModificationError`, and no row is resurrected (delta spec's own scenario).
      Verify red.
- [x] 6.4 Implement `update()`: a conditional `UPDATE ... WHERE id = ? AND
      country_accounts_id = ? AND (` `updated_at IS NULL` when `expectedUpdatedAt === null`,
      else the millisecond-truncated `date_trunc` equality against the column's own
      `timestamp` type, no `::timestamptz` cast — design.md Decision 3 `)`, `RETURNING *`,
      all inside one transaction that — only on a non-zero-row result — also deletes and
      reinserts each of the four child collections (Task 5.3's shared helper). On a
      zero-row result, issue a diagnostic re-read by `id` (same shape as
      `DrizzleWorkflowRepository.diagnoseUpdateConflict`) and throw
      `ConcurrentModificationError` for "no row" or "updated_at mismatch", or the existing
      identity-mismatch `ConflictError` if the row belongs to a different tenant/entity.
      Verify green: Tasks 6.1-6.3 all pass together, not just in isolation.
- [x] 6.5 Confirm the CAS guard (not a lock) is what discriminates Task 6.2's race under
      PGlite, unlike `5i`'s advisory-lock mechanism: temporarily remove the `updated_at`
      predicate from the `WHERE` clause, confirm Task 6.2's test now fails (both calls
      succeed), then restore it and confirm the test passes again. Record this
      confirmation in this task's own commit — no separate real-Postgres duplicate test is
      needed for this mechanism, unlike `5i`'s advisory locks (design.md note, proposal.md
      Test approach).
- [x] 6.6 Refactor, keeping all tests green.

## 7. DrizzleHazardousEventRepository — delete() (Task 0.2's resolution — Option B)

- [x] 7.1 Write failing tests: a full delete removes the `hazardous_event` row, its
      incoming `event_relationship` rows, and the `event` supertype row, in one
      transaction (delta spec's own scenario); a foreign-tenant id touches nothing — not
      the `hazardous_event` row, not any `event_relationship` row, not the `event` row
      (delta spec's own scenario, the new cross-tenant gate this adapter closes per
      design.md Decision 6); calling `delete()` twice concurrently for the same zero-
      dependency event resolves both calls without throwing (delta spec's own scenario).
      Verify red.
- [x] 7.2 Write a failing test for the outgoing-relationship-gap resolution (Option B,
      design.md Decision 8): a pre-existing outgoing `event_relationship` row (this event
      as `parentId`) causes `delete()` to reject with `ConflictError`, not an opaque
      database error, with the whole transaction rolled back (nothing partially deleted).
      Verify red.
- [x] 7.3 Implement `delete()`: one transaction — `DELETE FROM hazardous_event WHERE id = ?
      AND country_accounts_id = ? RETURNING id` first; if zero rows, return immediately
      (no-op, per the port's existing no-throw-on-no-match contract); otherwise delete
      incoming `event_relationship` rows (`childId = id`), then attempt the `event` row
      delete, catching a `23503` on `event_relationship_parent_id_event_id_fk` specifically
      and mapping it to `ConflictError` with a message equivalent to the legacy function's
      own ("delete events caused by this event first") — matching
      `DrizzleWorkflowRepository.mapWriteError`'s precedent for turning a raw PG code into
      a typed domain error. Verify green: Tasks 7.1-7.2 pass together.
- [x] 7.4 Refactor, keeping all tests green.

## 8. Use-case call sites

- [x] 8.1 Update `app/domains/hazardous-events/application/use-cases/
      CreateHazardousEvent.test.ts`: change `FakeHazardousEventRepository`'s `save` method
      to `insert` (same signature/behavior — this use case only ever inserts), and every
      `harness.hazardousEventRepository.saveCalls`/`saveBehavior` reference to
      `insertCalls`/`insertBehavior`, per the `create-hazardous-event` spec delta's updated
      scenarios. Verify red: `yarn vitest run app/domains/hazardous-events/
      application/use-cases/CreateHazardousEvent.test.ts` (use case still calls `.save()`).
- [x] 8.2 In `CreateHazardousEvent.ts` line 184, change
      `this.hazardousEventRepository.save(newEvent)` to
      `this.hazardousEventRepository.insert(newEvent)`. Verify: Task 8.1's tests pass.
- [x] 8.3 Update `app/domains/hazardous-events/application/use-cases/
      UpdateHazardousEvent.test.ts`: change `FakeHazardousEventRepository`'s `save` method
      to `insert`/`update`, and every `saveCalls` reference to `updateCalls` (this use case
      only ever updates an existing entity), asserting the second argument passed to
      `update` equals the pre-merge `existingEvent.updatedAt` for each scenario. Add a new
      test for `ConcurrentModificationError` propagating unmodified from a stale `update()`
      call (no retry), per the `update-hazardous-event` spec delta's new requirement. Add
      the mandatory concurrent-callers sibling test (two concurrent `execute()` calls for
      the same event, same previously-read `updatedAt`, different field changes — exactly
      one succeeds). Verify red: `yarn vitest run app/domains/hazardous-events/
      application/use-cases/UpdateHazardousEvent.test.ts`.
- [x] 8.4 In `UpdateHazardousEvent.ts` line 237, change
      `this.hazardousEventRepository.save(updatedEvent)` to
      `this.hazardousEventRepository.update(updatedEvent, existingEvent.updatedAt)`.
      Verify: Task 8.3's tests pass.

## 9. Other IHazardousEventRepository fakes across use-case tests

- [x] 9.1 Update the `FakeHazardousEventRepository` (or equivalent stub) in each of
      `app/domains/hazardous-events/application/use-cases/DeleteHazardousEvent.test.ts`,
      `GetHazardousEventById.test.ts`, `ListHazardousEvents.test.ts`, and
      `RecordSpatialObservation.test.ts` (confirmed via grep: these four files implement
      `IHazardousEventRepository` but none calls `save`/`insert`/`update` directly in its
      own assertions — each fake must still compile against the new interface shape) to
      implement `insert`/`update` instead of `save`. Verify: `yarn tsc` reports zero errors
      in these four files.

## 10. Deferred-items register

- [x] 10.1 Once Section 7 is complete: delete the `DEF-035` row from
      `_docs/refactoring-plan/deferred-items-register.md` and add a new, narrower row
      describing only the remaining outgoing-role gap (Option B inherits it, mapped to
      `ConflictError` — does not fix it), per design.md Decision 8's "Register mechanics"
      note — do not leave `DEF-035` annotated in place (resolve-by-deletion convention).
- [x] 10.2 Delete the `DEF-037` row once Section 6 is complete and green.
- [x] 10.3 Leave `DEF-038` and `DEF-031` exactly as they are — both are explicitly inherited/
      still-open per design.md Risks, not resolved by this change. Do not edit either row.

## 11. Quality gates

- [x] 11.1 `yarn vitest run app/domains/hazardous-events/application/ports/
      IHazardousEventRepository.test.ts tests/integration/db/queries/
      DrizzleHazardousEventRepository.test.ts app/domains/hazardous-events/
      application/use-cases/CreateHazardousEvent.test.ts app/domains/hazardous-events/
      application/use-cases/UpdateHazardousEvent.test.ts app/domains/hazardous-events/
      application/use-cases/DeleteHazardousEvent.test.ts app/domains/hazardous-events/
      application/use-cases/GetHazardousEventById.test.ts app/domains/hazardous-events/
      application/use-cases/ListHazardousEvents.test.ts app/domains/hazardous-events/
      application/use-cases/RecordSpatialObservation.test.ts` — all green together.
- [x] 11.2 `yarn tsc` — zero TypeScript errors.
- [x] 11.3 `npx prettier --check` scoped to every file touched in Sections 1-10 (never a
      bare `yarn format`) — fix any drift with a scoped `npx prettier --write` on the same
      file list, previewing the diff first.
- [x] 11.4 Anti-pattern review: check every touched file against `.github/skills/
      anti-pattern-check/SKILL.md`; resolve any match found.
- [x] 11.5 SOLID review: invoke the `solid-reviewer` agent against
      `DrizzleHazardousEventRepository.server.ts` and the two use-case call-site changes;
      resolve any violation found (fix-vs-defer is a joint call with the user).
- [x] 11.6 Documentation review: one full-diff sweep (not per-round), done by a fresh
      subagent, confirming every new comment explains WHY not WHAT (e.g. why the CAS token
      is nullable, why no `::timestamptz` cast, why the legacy `attachments` JSONB column
      is untouched, why the tenant-gated delete runs first, why the outgoing-relationship
      23503 is mapped to `ConflictError`), compacted without losing meaning.
- [x] 11.7 Project-conventions review: check the touched files against
      `.github/copilot-instructions.md`.
- [x] 11.8 Test-quality-auditor: invoke `test-quality-auditor` scoped to
      `DrizzleHazardousEventRepository.server.ts`, `IHazardousEventRepository.ts`,
      `CreateHazardousEvent.ts`, and `UpdateHazardousEvent.ts` (all contain real
      implementation logic touched by this change); resolve any real gap found, in
      particular around the CAS guard and the delete cleanup-order scenarios.
- [x] 11.9 Code review: run `.github/skills/code-review/SKILL.md` in full, via a fresh
      subagent, against the complete diff for this change.
- [x] 11.10 Visual/UX parity review: **not applicable** — this change touches no
      `app/domains/*/presentation/` or `app/routes/` file. State this explicitly rather
      than silently skipping.
- [x] 11.11 Independent second-opinion review: invoke Claude Code's built-in `code-review`
      at `high` effort via a second, separate fresh subagent; resolve findings before
      archiving.

## 12. Regression and archive

- [x] 12.1 Run `yarn test:run2` (full PGlite suite) and confirm it passes with no new
      failures. If any failure is suspected pre-existing, confirm this by running the same
      suite against this branch's base (`feature/he-ca-phase5` tip) before attributing it
      elsewhere — do not assume, per the no-assumptions-certainty rule.
- [x] 12.2 Run `opsx:archive` on this branch (`feature/ca-he-drizzle-repository-core`)
      before raising the PR.
