## 1. Test helpers

- [x] 1.1 Confirm `tests/integration/db/models/hazardousEventTestHelpers.ts`'s `seedUser()` export
      is usable as-is (returns a new `userTable` row's id) by reading the file — no new helper
      file needed. Verify by running
      `yarn vitest run tests/integration/db/models/hazardousEventCoreCrud.test.ts` (an existing
      consumer of `seedUser()`) to confirm it still passes unmodified, proving the helper is
      stable to import from a new location.

## 2. DrizzleWorkflowRepository — failing tests first (Red)

- [x] 2.1 Write `tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`
      with `import "../../db/setup"` (confirmed path — see design.md Context), importing `dr` from
      `~/db.server` and `seedUser` from `../../db/models/hazardousEventTestHelpers`. Cover every
      scenario in `specs/workflow-repository-port/spec.md`'s new ADDED requirements:
      - `findByEntity`: happy path; no row at all resolves null; entityType isolation (seed the
        same `entityId` under both `'HE'` and `'DE'`, query `'HE'`, assert the `'DE'` row is never
        returned and querying for an `entityId` with only a `'DE'` row resolves null for `'HE'`);
        a row whose persisted attribution columns violate `WorkflowInstance.create()`'s own
        required-set/required-null invariant for its `status` (e.g. insert a row with
        `status = 'PUBLISHED'` directly via `dr.insert(workflowInstanceTable)`, bypassing the
        domain entity, leaving `validatedByUserId`/`validatedAt` both `null`) causes `findByEntity`
        to reject with `ValidationError`, not resolve `null` or a partial entity.
      - `findByEntityIds`: mixed existing/missing ids in one batch, asserting both the returned
        array AND (via `vi.spyOn(dr.$client, "query")`, per design.md Decision 6) exactly one
        underlying query call; entityType isolation in a batch; empty-array input resolves `[]`
        with the query spy never invoked; a batch of two ids where one row is
        domain-construction-valid and the other directly-inserted-invalid (same technique as
        `findByEntity`'s own invariant-violation test above) resolves an array containing only the
        valid instance, does not reject, and emits exactly one structured log entry (assert via
        `vi.spyOn` on the logger obtained through `getPinoLogger()`, or equivalently intercept its
        underlying transport) naming the skipped row's `entityId`/`entityType`.
      - `save`: first insert; update of an existing row by `id` (status transition, confirm
        `updated_at` equals the instance's own `updatedAt`, not a DB-generated value — use a
        clearly-past `updatedAt` on the instance and assert the persisted value matches it
        exactly, not `now()`); `entity_id`/`entity_type`/`created_at` unchanged by an update;
        unique-violation on `(entity_id, entity_type)` during insert (different `id`, same
        entity) rejects with `ConflictError` and leaves exactly one row; the identity-mismatch
        guard (an existing `id` reused with a *different* `entityId`/`entityType` than the row it
        already belongs to rejects with `ConflictError`, and the original row's own identity is
        unchanged afterward — Decision 3); the two mandatory concurrent-callers scenarios from the
        spec (first-insert race → one success, one `ConflictError`, one row; concurrent updates to
        the same `id` → both resolve, last commit wins, documented as characterizing `DEF-024`).
      - `save` round-trip scenarios, each running the real `WorkflowInstance` domain transition
        method, saving its result, then re-reading via `findByEntity` and asserting every one of
        the 14 persisted fields (not just `status`): DRAFT→SUBMITTED (submitted pair set, all
        others null); validate-only (stays SUBMITTED, validated pair set, approved/published
        pairs still null); SUBMITTED→APPROVED (approved pair set); a full
        SUBMITTED→REVISION_REQUESTED→SUBMITTED round trip where a previously-persisted
        `validatedByUserId`/`validatedAt` must come back `null` after the second `submit()` — the
        sharpest test of whether the `SET` clause does an unconditional overwrite or a
        skip/COALESCE-if-null that would let a stale validator survive; APPROVED→PUBLISHED with no
        prior validator (backfills `validatedByUserId`/`validatedAt` to the publisher); and
        APPROVED→PUBLISHED with a validator already set to a different user (preserved, not
        overwritten by the publisher).
      - `deleteByEntity`: deletes matching row; entityType isolation (deleting `'HE'` leaves a
        `'DE'` row for the same `entityId` intact); no-op when nothing matches; concurrent deletes
        of the same row both resolve.
      - No-tenant-filter scenario: seed a real `hazardousEventTable` row for a specific tenant via
        `seedHazardousEvent()` (same helper file), save a `WorkflowInstance` whose `entityId` is
        that event's own id, and confirm `findByEntity` returns it with no tenant argument
        supplied anywhere in the call — makes the scenario concrete against a real tenant-owned
        entity rather than an arbitrary UUID (per spec's final requirement).
      - Seed real `userTable` rows via `seedUser()` for every transition round-trip test that sets
        an attribution pair (submitted/validated/approved/published), since those columns carry a
        real FK.
      Verify the file fails to compile/run (the adapter does not exist yet) — Red.

## 3. DrizzleWorkflowRepository — implementation (Green)

- [x] 3.1 Implement
      `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts`
      fulfilling `IWorkflowRepository`, per design.md Decisions 1-7:
      - `findByEntity`: `WHERE entity_id = ...` (`eq`) combined with `AND entity_type = ...`; map
        the row through `WorkflowInstance.create()`, letting a thrown `ValidationError` propagate
        unmodified (Decision 7).
      - `findByEntityIds`: `WHERE entity_id = ANY(...)` (`inArray`) combined with
        `AND entity_type = ...`; short-circuits to `[]` on an empty `entityIds` array before
        querying (Decision 5); maps each row through `WorkflowInstance.create()` inside a per-row
        `try`/`catch` — a row that throws is **not** included in `.map()`'s output and is instead
        logged via `getPinoLogger().warn({ msg: "workflow_instance.invariant_violation_skipped",
        entityId: row.entityId, entityType: row.entityType, err })` and omitted, never causing the
        whole call to reject (Decision 7). Use a `for`/`reduce` loop or `.flatMap()` with a
        try/catch per iteration, not `.map()` followed by a post-hoc filter (a thrown error inside
        `.map()`'s callback aborts the whole `.map()`, it does not produce a catchable per-element
        result).
      - `save`: `INSERT ... ON CONFLICT (id) DO UPDATE SET` every mutable field (status and all
        four attribution pairs plus `updatedAt`) excluding `entityId`/`entityType`/`createdAt`,
        guarded by `WHERE entity_id = ... AND entity_type = ...` on the conflict branch (Decision
        3); empty `RETURNING` after the upsert (the guard failed, e.g. an `id` reused for a
        different entity) throws `ConflictError`; a thrown unique-violation on insert is caught
        and re-thrown as `ConflictError`, checking both `err.code` and `err.cause?.code` for
        `"23505"` (Decision 4 — not copying `DrizzleNoticeRepository`'s single-level check
        uncritically; narrow `err` from `unknown` via an explicit `typeof`/`in` guard, never
        `as any`).
      - `deleteByEntity`: `DELETE ... WHERE entity_id = ... AND entity_type = ...`, no existence
        check, no thrown error on zero affected rows.
      Verify with
      `yarn vitest run tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`
      — all scenarios from 2.1 pass (Green).

## 4. Refactor

- [x] 4.1 Re-read the full adapter file once Green. Extract a private row-to-entity mapping
      helper if the mapping logic is duplicated across `findByEntity`/`findByEntityIds` (matching
      `DrizzleNoticeRepository.toEntity()`'s own precedent), and a private column-set builder if
      the `save()` insert-values and conflict-update-set objects duplicate the same field list.
      Verify with the same test command as 3.1 — still Green after refactor.

## 5. Quality gates

- [x] 5.1 `yarn vitest run tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts`
      — tests still green.
- [x] 5.2 `yarn tsc` — zero TypeScript errors.
- [x] 5.3 `npx prettier --check app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts tests/integration/domains/validation-workflow/DrizzleWorkflowRepository.test.ts` —
      never a bulk/repo-wide `yarn format` (known to reformat 300+ unrelated files in this repo).
      If drift is reported, fix with `npx prettier --write` on that same explicit, scoped file
      list only, then re-run `--check` to confirm.
- [x] 5.4 Anti-pattern review against `.github/skills/anti-pattern-check/SKILL.md` — confirm no
      listed anti-pattern is reproduced, in particular the `error?.code`-vs-`error.cause.code`
      pattern this change's own design.md Decision 4 exists to avoid.
- [x] 5.5 SOLID review — invoke the `solid-reviewer` agent against
      `DrizzleWorkflowRepository.server.ts`; resolve findings.
- [x] 5.6 Documentation review — a fresh subagent sweeps every comment added in this change
      (not self-review), confirming comments explain WHY (e.g. why `updatedAt` is persisted as
      given rather than DB-generated, why the error-code check looks at both `err.code` and
      `err.cause?.code`) not WHAT, compacted without losing meaning; one full-diff sweep before
      the final report.
- [x] 5.7 Project conventions review against `.github/copilot-instructions.md`.
- [x] 5.8 Code review — run `.github/skills/code-review/SKILL.md` in full, via a fresh subagent.
- [x] 5.9 Visual/UX parity review — **skipped explicitly**: this change touches no
      `app/domains/*/presentation/` file and no `app/routes/` file; there is no presentation
      surface to compare against a reference page.
- [x] 5.10 Independent second-opinion review — invoke Claude Code's built-in `code-review` at
      `high` effort via a second, separate fresh subagent; resolve findings before archiving.

## 6. Test quality

- [x] 6.1 Invoke `test-quality-auditor` scoped to
      `app/domains/validation-workflow/infrastructure/DrizzleWorkflowRepository.server.ts` (the
      one file in this change with real implementation logic). Resolve any real mutation-coverage
      gap found, particularly around the `ConflictError`-mapping branches (identity-mismatch guard
      vs. unique-violation catch — two different code paths that both throw the same error type,
      easy for a mutant to survive on), the `entityType` isolation filters, and `findByEntityIds`'s
      per-row try/catch (a mutant that removes the catch and lets the error propagate, or one that
      silently drops a *valid* row too, must be caught by 2.1's dedicated scenario).

## 7. Regression and archive

- [x] 7.1 Run `yarn test:run2` (full PGlite suite) and confirm no new failures versus this
      branch's own base (`feature/he-ca-phase5`/`dev`) — run the same suite on the base branch
      first if any failure appears, to confirm it is pre-existing rather than assumed.
- [x] 7.2 Run `opsx:archive` on this same branch (`feature/ca-drizzle-workflow-repository`)
      before raising the PR.
