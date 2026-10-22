## 1. SpatialObservationRecord — type alias (closes DEF-027)

- [x] 1.1 This is a pure refactor with no possible red phase: `SpatialObservationProps` and the
      current hand-maintained `SpatialObservationRecord` are already field-identical (Context), so
      any type-level assignability assertion between them already passes today and cannot be made
      to fail first (same shape of exception `ca-persistence-unit-of-work`'s own token-file task
      — `TransactionRunnerToken.ts` — recorded for a file with nothing to red-test). Skip writing a
      failing test for this; go directly to Task 1.2, then add the verification in Task 1.2 itself
      via source inspection, not a compile-time assertion (a compile-time assertion cannot
      distinguish "a type alias" from "two structurally-identical interfaces" — the spec's own
      scenario is about the *declaration form*, which only a source-level check can verify).
- [x] 1.2 In `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts`: delete
      the hand-maintained `SpatialObservationRecord` interface; add `import type {
      SpatialObservationProps } from "../../domain/SpatialObservation";` and `export type
      SpatialObservationRecord = SpatialObservationProps;`; update the file's own "Minimal,
      provisional shape" doc comment to describe the now-real type-alias relationship. Verify (per
      Task 1.1 — source inspection, the spec's own scenario): `grep -n "SpatialObservationRecord"
      app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` shows a `type`
      alias assignment, not an `interface SpatialObservationRecord {` declaration; `yarn tsc` clean
      for this file; every other existing scenario in `IHazardousEventRepository.test.ts` (the
      `FakeHazardousEventRepository` conformance tests) still passes unchanged — the fake's own
      `makeSpatialObservation` helper needs no change, since the field shape is identical.
- [x] 1.3 Update `app/domains/hazardous-events/domain/SpatialObservation.ts`'s file-header comment
      (currently "supersedes ... the port's provisional `SpatialObservationRecord`") to reflect
      that the port now aliases this file's own `SpatialObservationProps` directly — no behavior
      change, comment only. Verify: `yarn tsc` clean; `SpatialObservation.test.ts` unchanged and
      still passing.

## 2. IDivisionRepository — widen with optional tx (design.md Decision 8, user-approved fold-in)

- [x] 2.1 Update `app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts`: widen
      the existing `AssertEqual` arity assertion for `findValidDivisionIds` from `[readonly
      string[], string]` to `[readonly string[], string, Tx?]` (`Tx` imported type-only from
      `~/db.server`, matching every other widened port's own test file). Verify:
      `yarn vitest run app/domains/hazardous-events/application/ports/IDivisionRepository.test.ts`
      fails to compile (the interface doesn't accept a third parameter yet).
- [x] 2.2 Update `app/domains/hazardous-events/application/ports/IDivisionRepository.ts`: add an
      optional trailing `tx?: Tx` to `findValidDivisionIds`; `import type { Tx } from
      "~/db.server"`; update the file's own doc comment to note the new parameter, matching the
      wording pattern `ca-persistence-unit-of-work` used for sibling ports (e.g.
      `ICausalChainRepository.ts`'s own `tx?: Tx` additions). Verify: Task 2.1's test passes; `yarn
      tsc` clean for this file.

## 3. DrizzleDivisionRepository — new adapter (closes DEF-005's "no adapter" clause), tx-aware from the start

- [x] 3.1 Write failing PGlite integration tests in
      `tests/integration/db/queries/DrizzleDivisionRepository.test.ts` (new file, `import
      "../setup";`, mirroring `DrizzleHazardTaxonomyRepository.test.ts`'s own file shape) for
      `findValidDivisionIds`: resolves only same-tenant division ids from a mixed-tenant set of
      real, seeded `division` rows; excludes a non-existent id without throwing; resolves an empty
      set for an empty `ids` array, issuing no query (assert via a spy on the Drizzle client, or by
      confirming the call completes without needing a seeded row); excludes a real, seeded
      `division` row whose `countryAccountsId` is `null`, for two different queried tenants; **tx
      threading** — called with an externally-supplied, not-yet-committed `tx` under which a
      valid-for-tenant `division` row has been inserted but not yet committed, the resolved set
      includes that id (a read via a separate connection would not see it). Verify: tests fail (the
      adapter file doesn't exist yet).
- [x] 3.2 Implement `app/domains/hazardous-events/infrastructure/DrizzleDivisionRepository.server.ts`:
      `@Injectable()`, constructor `@Inject(DRIZZLE_CLIENT) private readonly db: Dr`, implementing
      `IDivisionRepository`, shaped exactly like `DrizzleHazardTaxonomyRepository.server.ts`'s own
      `resolveValidIds` (short-circuit on `ids.length === 0`, `(tx ?? this.db).select(...).from(divisionTable)
      .where(and(eq(divisionTable.countryAccountsId, tenantId), inArray(divisionTable.id,
      [...ids])))` — the resolved-executor pattern, not a hard-coded `this.db`). Verify: Task 3.1's
      tests pass; `yarn tsc` clean.
- [x] 3.3 Confirm spec coverage (no code change): `division-repository-port`'s spec delta
      (specs/division-repository-port/spec.md) MODIFIED requirement's scenarios are all satisfied
      by Task 3.1's tests, with no textual gap. Verify: re-read the delta alongside Task 3.1's test
      list and confirm 1:1 coverage.

## 4. RecordSpatialObservationUseCase — thread command.tx to the one findValidDivisionIds call

- [x] 4.1 Update `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.test.ts`:
      widen `DivisionLookupCall` to include `tx?: Tx`; widen `FakeDivisionRepository.findValidDivisionIds`
      to accept and record a third `tx?: Tx` parameter; add two scenarios to the existing "tx
      threading (design.md Decision 9)" `describe` block: `command.tx`, when present, is also
      passed to `divisionRepository.findValidDivisionIds` as its third argument (alongside the
      existing `findById`/`findSpatialObservationByTime`/`saveSpatialObservation` assertions);
      `command.tx` absent leaves `findValidDivisionIds`'s third argument `undefined`, matching the
      existing sibling assertions' own shape. Verify: both new assertions fail (the real call site
      doesn't pass `command.tx` yet).
- [x] 4.2 In `app/domains/hazardous-events/application/use-cases/RecordSpatialObservation.ts`: change
      `this.divisionRepository.findValidDivisionIds(toSafeStringArray(command.divisionIds),
      command.tenantId)` to `this.divisionRepository.findValidDivisionIds(toSafeStringArray(command.divisionIds),
      command.tenantId, command.tx)` — the only edit to this file; no other line changes. Verify:
      Task 4.1's two new assertions pass; every other existing scenario in
      `RecordSpatialObservation.test.ts` still passes unchanged (the use case's own validation
      order, error contracts, and hydration pattern are untouched).
- [x] 4.3 Confirm spec coverage (no further code change): `record-spatial-observation`'s spec delta
      (specs/record-spatial-observation/spec.md) MODIFIED requirement's three scenarios are all
      satisfied by Task 4.1's tests (existing + the two new ones). Verify: re-read the delta
      alongside the test file and confirm 1:1 coverage.

## 5. DrizzleHazardousEventRepository — findCurrentSpatialObservation / findSpatialObservationByTime

- [x] 5.1 Write failing PGlite integration tests in
      `tests/integration/db/queries/DrizzleHazardousEventRepository.test.ts` (existing file,
      `import "../setup";`) for `findCurrentSpatialObservation`: resolves `null` when no
      observation exists; resolves the single observation when one exists, with `geometries` and
      `divisionIds` populated; **a backfilled earlier `observationTime` inserted after a later
      one does not become current** (insert the later `observationTime` first, then the earlier
      one, assert the later one is still resolved — the spec delta's own mandatory
      insertion-order-independence scenario); resolves `null` for a `hazardousEventId` that exists
      but belongs to a different tenant, even when that other tenant has a real recorded
      observation for it. Verify: tests fail (method still throws "not implemented yet (5e)").
- [x] 5.2 Write failing PGlite integration tests in the same file for
      `findSpatialObservationByTime`: resolves the exact-time match with `geometries`/`divisionIds`
      populated; resolves `null` for a different `observationTime`; resolves `null` for a
      foreign-tenant `hazardousEventId`, even at an `observationTime` that has a real observation
      under a different tenant; **duplicate-time detectability** — after seeding one observation at
      a known `observationTime`, a call for that exact `hazardousEventId`/`observationTime`
      resolves the existing record (not `null`), proving this is the exact query
      `RecordSpatialObservationUseCase`'s own duplicate-conflict check relies on. Verify: tests
      fail.
- [x] 5.3 Implement a shared private read-assembly helper (executor, hazardousEventId, tenantId,
      filter) used by both methods: joins `hazardous_event_spatial_observation` to
      `hazardous_event` on `hazardous_event_id = hazardous_event.id`, filtering
      `hazardous_event.country_accounts_id = tenantId`; loads geom rows via
      `sql<string>\`ST_AsGeoJSON(${geomTable.geom})\`` (`JSON.parse`'d) and division rows, assembling
      one `SpatialObservationRecord`. Implement `findCurrentSpatialObservation` (order by
      `observation_time DESC LIMIT 1`) and `findSpatialObservationByTime` (exact-match filter,
      threading `tx ?? this.db` as the executor) on top of it, replacing both stub bodies. Verify:
      Tasks 5.1 and 5.2 pass; `yarn tsc` clean.

## 6. DrizzleHazardousEventRepository — saveSpatialObservation

- [x] 6.1 Write a failing test for the input-shape guard: `saveSpatialObservation(hazardousEventId,
      observation, tenantId)` where `observation.hazardousEventId` differs from the
      `hazardousEventId` parameter rejects with `ValidationError`, writing no row. Verify: fails
      (method still throws the stub error).
- [x] 6.2 Write a failing test for the ownership check: a `hazardousEventId` that doesn't exist, and
      a `hazardousEventId` that exists under a different tenant, both reject with `NotFoundError`,
      writing no row in either case. Verify: fails.
- [x] 6.3 Write a failing test for the DB-layer division tenant re-check: a `divisionIds` entry
      belonging to a real, seeded `division` row under a different tenant rejects with
      `ValidationError`, writing no row — not the parent observation row, and not any geometry row
      (assert both tables are empty afterward). Verify: fails.
- [x] 6.4 Write a failing test for a brand-new observation: non-empty `geometries` (raw GeoJSON
      geometry objects, e.g. `{ type: "Point", coordinates: [1, 1] }` — matching every existing
      fixture's own shape, not a wrapper) and non-empty, valid-for-tenant `divisionIds` persist
      across all three tables; the resolved record's `geometries`/`divisionIds` match the input by
      set equality (order not asserted); the resolved and re-read `createdAt` equals the caller's
      own `observation.createdAt` (design.md Decision 6 step 4 — not the DB column's
      `CURRENT_TIMESTAMP` default); a subsequent `findSpatialObservationByTime` round-trips the
      same `geometries` (structural GeoJSON equality after `JSON.parse`) and `divisionIds`. Verify:
      fails.
- [x] 6.5 Write a failing test for a replace: seed an observation, call `saveSpatialObservation`
      again with the same `observation.id`, a changed `note`, different `geometries`, and zero
      `divisionIds` — the resolved and re-read record reflects only the new values (old
      `geometries`/`divisionIds` are gone, not merged); the re-read `createdAt` equals the
      original, unchanged. Verify: fails.
- [x] 6.6 Write a failing test for the cross-event id-collision guard: seed an observation under
      `hazardousEventId` A; call `saveSpatialObservation` with that same `observation.id` but
      `hazardousEventId`/`observation.hazardousEventId` both set to a different, valid-for-tenant
      `hazardousEventId` B — rejects with `ConflictError`; the original observation under A is
      unchanged afterward. Verify: fails.
- [x] 6.7 Write a failing test asserting every statement in `saveSpatialObservation` uses the
      resolved executor, not a hard-coded `this.db`: called with an externally-supplied,
      not-yet-committed `tx` under which the caller has already inserted the target
      `hazardous_event` row — the ownership check must see that uncommitted row via `tx`, not
      reject with `NotFoundError` (the Decision 2/9 regression shape from `ca-persistence-unit-of-work`,
      applied to this new method). Verify: fails (method doesn't exist yet, or hangs if
      implemented with a hard-coded `this.db` — note in the task if a hang is observed rather than
      a clean failure, matching that change's own documented symptom).
- [x] 6.8 Write a failing test discovering `ST_GeomFromGeoJSON`'s real failure mode for a malformed
      `geometries` element (e.g. `{ type: "Point" }` with no `coordinates`, or a non-object
      element): call `saveSpatialObservation` with it and record which error (PG code, message
      shape) actually surfaces. Verify: fails only in the sense that the method doesn't exist yet —
      this task's real output is the empirically-confirmed error code/shape, feeding Task 6.10's
      mapping; do not assume the code in advance (design.md Decision 4/Risks).
- [x] 6.9 Write a failing **PGlite** concurrent-callers test (design.md Decision 5 — no
      `tests/integration-realdb/` counterpart needed): two concurrent `saveSpatialObservation` calls
      for the same `hazardousEventId`/`observationTime`, each with a distinct, freshly-generated
      `observation.id`, both started before either resolves — exactly one resolves successfully;
      the other rejects with `ConflictError`; exactly one `hazardous_event_spatial_observation` row
      exists for that pair once both have settled. Verify: fails.
- [x] 6.10 Implement `saveSpatialObservation` per design.md Decision 6: input-shape guard; ownership
      check; division tenant re-check; parent-row upsert (`ON CONFLICT (id) DO UPDATE ... WHERE
      hazardous_event_id = $hazardousEventId`, `createdAt` supplied on the `values()` insert path,
      excluded from `SET`, mirroring `DrizzleNoticeRepository.server.ts`'s `save()`); empty-`RETURNING`
      → `ConflictError`; delete-then-reinsert geom/division child rows (skip insert for an empty
      collection, mirroring `DrizzleHazardousEventRepository.server.ts`'s own `insertChildCollections`
      convention); error mapping (`23505` on the time-uniqueness constraint → `ConflictError` with
      `{ hazardousEventId, observationTime }`; `23505` on the division-pair-uniqueness constraint →
      `ValidationError`; `23503` → `ValidationError`; Task 6.8's discovered malformed-geometry code
      → `ValidationError` once confirmed; any other error rethrown unmodified); every statement
      inside one `(tx ?? this.db).transaction(async (innerTx) => {...})` call using `innerTx`
      throughout, never `this.db`; return value assembled via Task 5.3's shared read helper against
      `innerTx`. Verify: Tasks 6.1–6.9 all pass; `yarn tsc` clean.

## 7. Spec and register housekeeping

- [x] 7.1 Confirm every MODIFIED requirement header in this change's three spec deltas
      (`specs/hazardous-event-repository-port/spec.md`, `specs/division-repository-port/spec.md`,
      `specs/record-spatial-observation/spec.md`) matches its corresponding merged main spec's
      existing header verbatim (whitespace-insensitive), per OpenSpec's MODIFIED-matching rule.
      Verify: `openspec validate ca-he-spatial-observation-persistence --type change --strict`
      reports no header mismatch; `openspec show ca-he-spatial-observation-persistence --json
      --deltas-only` shows the type-alias requirement parsed as `ADDED` and the three
      port/use-case requirements parsed as `MODIFIED`.
- [x] 7.2 Remove `DrizzleHazardousEventRepository.server.ts`'s `// Spatial-observation (5e) is a
      separate later intent.` comment above the three now-implemented methods. Verify: `yarn tsc`
      clean; no test depends on the comment's text.
- [x] 7.3 Update `_docs/refactoring-plan/deferred-items-register.md`:
      - **`DEF-027`**: fully closed by Section 1 (`SpatialObservationRecord` is now a genuine type
        alias). Delete this row entirely (this register's own "delete the row" convention — never
        annotate "RESOLVED" in place).
      - **`DEF-005`**: narrow, do not delete (user decision, confirmed) — the row's "no adapter
        yet" clause is closed by Sections 2-3/6, but its legacy-function clause is not, and per the
        standing principle that legacy code is replaced at cutover, never patched, that clause
        stays open until a future change actually retires the legacy route. Replace only the
        **Detail** and **Trigger** columns with the text below, verbatim; leave ID/Title/Domain/
        Category/Origin as they are:
        - **Detail**: `syncHazardousEventSpatialFootprint` (legacy) still has no tenant check on
          division linking, unguarded in live routes. `5e` closes this for the new CA path via
          `IDivisionRepository`/`DrizzleDivisionRepository`; the legacy function itself is
          untouched by design — never patched directly, only replaced at cutover.
        - **Trigger**: Phase 7 (cutover) — row closes only when the legacy route/function is
          retired, not before.

        Verify: `grep -n "DEF-027" _docs/refactoring-plan/deferred-items-register.md` returns no
        match; `DEF-005`'s row still exists with its Detail/Trigger columns replaced exactly as
        above and its other columns unchanged.

## 8. Full-suite verification

- [x] 8.1 Run `yarn tsc` across the whole repo and confirm zero errors.
- [x] 8.2 Run `npx prettier --check` scoped to every file touched in Sections 1-7 (never a bare
      `yarn format` — it reformats unrelated files in this repo); fix any drift with a scoped `npx
      prettier --write` on the same file list, previewing the diff first before writing.
- [x] 8.3 Anti-pattern review: check the touched files against
      `.github/skills/anti-pattern-check/SKILL.md`; resolve any match found.
- [x] 8.4 SOLID review: invoke the `solid-reviewer` agent against the touched files — focus on
      whether `DrizzleDivisionRepository.server.ts` and the new `saveSpatialObservation`
      implementation stay single-responsibility (tenant/ownership checks vs. persistence vs. error
      mapping as distinct, named steps, matching Decision 6's own structure) rather than one large
      undifferentiated method. Resolve any violation found (fix-vs-defer is a joint call — report
      findings with reasoning, don't unilaterally defer).
- [x] 8.5 Documentation review: one full-diff sweep (not per-round), by a fresh subagent, confirming
      every new comment explains WHY, not WHAT, and is as terse as possible without losing meaning.
- [x] 8.6 Project-conventions review: check the touched files against
      `.github/copilot-instructions.md` — `.server.ts` suffixing on both new/modified adapter files;
      every query tenant-scoped via `countryAccountsId`/`tenantId`; no `drizzle-kit push` anywhere;
      no new `node:test` usage; new tests under `tests/` using Vitest with the correct `import
      "../setup"` path.
- [x] 8.7 Test-quality-auditor: invoke `test-quality-auditor` scoped to
      `DrizzleHazardousEventRepository.server.ts` and `DrizzleDivisionRepository.server.ts` (both
      contain real implementation logic). Expect the `DEF-041` Babel/`implements`-clause
      instrumenter crash on both (design.md Risks) — note it, do not file a new register entry per
      the standing rule. Resolve any other, real gap it finds.
- [x] 8.8 Code review: run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent,
      against the complete diff for this change. Resolve all blocking findings; report non-blocking
      findings with reasoning for a joint fix-vs-defer call.
- [x] 8.9 Visual/UX parity review: **not applicable** — this change touches no
      `app/domains/*/presentation/` or `app/routes/` file. State this explicitly.
- [x] 8.10 Independent second-opinion review: invoke Claude Code's built-in `code-review` at `high`
      effort via a second, separate fresh subagent; resolve findings before archiving.

## 9. Regression gate and archive

- [x] 9.1 Run `yarn test:run2` (full PGlite suite) and confirm it passes with no new failures. If
      any failure is suspected pre-existing, confirm by running the same suite against the base
      branch (`feature/he-ca-phase5`) before this change's commits — do not label a failure
      "pre-existing" without that comparison (standing no-assumptions-certainty rule).
- [x] 9.2 Confirm Section 7's deferred-register edits and Sections 1-6's implementation are both
      complete, then run `opsx:archive` on this change, on this branch
      (`feature/ca-he-spatial-observation-persistence`), before raising the PR.
