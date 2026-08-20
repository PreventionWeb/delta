## 1. Red — failing tests for the new service's core calculation logic

- [ ] 1.1 Create `tests/integration/db/services/disasterEventCostRollupService.test.ts` with
      `import "../../setup"` (two levels below `tests/integration/db/`). Seed helpers should
      create a country account, a disaster event, one or more disaster records linked to it via
      `disasterEventId`, and rows in `damagesTable`, `disruptionTable`, and
      `sectorDisasterRecordsRelationTable` as needed per scenario.
- [ ] 1.2 Write failing tests for `recalculateCostsForDisasterEvent` covering every scenario in
      `specs/disaster-event-cost-rollup-service/spec.md` under "Recalculate costs for a disaster
      event": no linked records, one linked record, multiple linked records (aggregation),
      unknown event id (zero rows affected, no throw).
- [ ] 1.3 Write failing tests for `recalculateCostsForDisasterRecord` covering: record linked to
      an event (delegates correctly), record not linked (no-op, no throw), unknown record id
      (throws).
- [ ] 1.4 Write failing tests for repair/replacement cost summation (multiple `damagesTable` rows,
      `null` values treated as `0`) and rehabilitation cost summation (multiple `disruptionTable`
      rows, `null` treated as `0`).
- [ ] 1.5 Write failing tests for the recovery-cost two-level fallback, covering all five
      scenarios under "Recovery cost calculation" in the spec: explicit override, explicit `0`
      override (the falsy-zero edge case — assert the override still wins, not the damages
      fallback), no-override fallback to damages sum, no-override with no matching damages rows,
      and a damages row with no corresponding sector-relation row (must contribute `0`).
- [ ] 1.6 Write the mandatory concurrent-callers test per the spec's "Concurrent recalculation of
      the same disaster event" requirement: trigger two `recalculateCostsForDisasterEvent` calls
      for the same event id with different underlying data present at each call's read time
      (e.g. insert row A, start recalculation A's read, insert row B, let recalculation B run and
      commit before A commits), and assert the final persisted totals equal whichever
      recalculation committed last — documenting the known non-serialized behavior, not asserting
      an eventual-consistency guarantee the code doesn't provide.
- [ ] 1.7 Run `yarn vitest run tests/integration/db/services/disasterEventCostRollupService.test.ts`
      and confirm all new tests fail because
      `app/backend.server/services/disasterEventCostRollupService.ts` does not exist yet.

## 2. Green — implement the service

- [ ] 2.1 Create `app/backend.server/services/disasterEventCostRollupService.ts`. Move the four
      calculator functions from `app/backend.server/models/analytics/disaster-events-cost-calculator.ts`
      in as private (non-exported) functions, preserving their query logic except for the two
      named fixes below.
- [ ] 2.2 Export `recalculateCostsForDisasterEvent(tx: Tx, disasterEventId: string): Promise<void>`
      (renamed from `updateTotals`) and `recalculateCostsForDisasterRecord(tx: Tx, disasterRecordId: string): Promise<void>`
      (renamed from `updateTotalsUsingDisasterRecordId`), with identical behavior to today's
      exports otherwise.
- [ ] 2.3 Remove the dead `totalRecoveryCost += Number();` line and its stale "produces NaN"
      comment from the recovery-cost calculation (Decision 4 / proposal.md Why — this is a no-op
      removal, not a numeric fix; no test should assert a value change from this line alone).
- [ ] 2.4 Rewrite the recovery-cost calculation's damages lookup to a single batched query instead
      of one query per sector-relation row, per design.md Decision 4: fetch all `damagesTable`
      rows for the event's record ids once, index them in memory by `(recordId, sectorId)`, and
      keep iterating `sectorDisasterRecordsRelationTable` rows as the outer loop with the same
      override-or-fallback branch. Preserve string-truthiness on `damageRecoveryCost` (do not
      coerce to `Number(...)` before the truthiness check).
- [ ] 2.5 Run `yarn vitest run tests/integration/db/services/disasterEventCostRollupService.test.ts`
      and confirm all tests pass.

## 3. Red — failing tests for delete-path recalculation wiring

- [ ] 3.1 Create `tests/integration/db/models/disasterRecordCostRecalcOnDelete.test.ts` with
      `import "../../setup"`. Seed a disaster event, a linked disaster record, and contributing
      rows, then assert current (pre-fix) behavior would fail: after calling
      `damagesDeleteById`, the linked event's `*Calc` columns should reflect the deletion.
- [ ] 3.2 Add one failing scenario per delete function named in the spec's "Recalculation is
      triggered on create, update, and delete of contributing data" requirement:
      `damagesDeleteById`, `damagesDeleteBySectorId`, `disruptionDeleteById`,
      `disruptionDeleteBySectorId`, `disRecSectorsDeleteById`, `deleteRecordsDeleteById`.
- [ ] 3.3 Add a failing (or passing-by-absence) scenario asserting `disasterRecordsCreate` does
      NOT trigger recalculation — this should already pass today and must continue to; include it
      as a regression guard against accidentally wiring recalculation into record creation.
- [ ] 3.4 Run `yarn vitest run tests/integration/db/models/disasterRecordCostRecalcOnDelete.test.ts`
      and confirm the six delete-triggers-recalculation scenarios fail (current code does not call
      recalculation after delete) and the create-does-not-trigger scenario passes.

## 4. Green — wire all call sites onto the new service

- [ ] 4.1 In `app/backend.server/models/damages.ts`: replace the import from
      `./analytics/disaster-events-cost-calculator` with
      `~/backend.server/services/disasterEventCostRollupService`; update `damagesCreate`,
      `damagesUpdate`, `damagesUpdateByIdAndCountryAccountsId` to call
      `recalculateCostsForDisasterRecord`. Add a call to `recalculateCostsForDisasterRecord` in
      `damagesDeleteById` and `damagesDeleteBySectorId` after their delete completes (resolve
      `recordId` from the row being deleted before the delete executes, since the row won't exist
      to query afterward).
- [ ] 4.2 In `app/backend.server/models/disruption.ts`: same import swap for `disruptionCreate`,
      `disruptionUpdate`, `disruptionUpdateByIdAndCountryAccountsId`; add the post-delete call to
      `disruptionDeleteById` and `disruptionDeleteBySectorId`.
- [ ] 4.3 In `app/backend.server/models/disaster_record__sectors.ts`: same import swap for
      `disRecSectorsCreate`, `disRecSectorsUpdate`, `disRecSectorsUpdateByIdAndCountryAccountsId`,
      and `upsertRecord` (this call site passes `dr`, not a `tx` — confirm the new service's `Tx`
      parameter type accepts it unchanged, per design.md Context). Add the post-delete call to
      `disRecSectorsDeleteById` and `deleteRecordsDeleteById`.
- [ ] 4.4 In `app/backend.server/models/disaster_record.ts`: same import swap for
      `disasterRecordsUpdate` only — `disasterRecordsCreate` remains unchanged (no recalculation
      call), per spec.
- [ ] 4.5 Delete `app/backend.server/models/analytics/disaster-events-cost-calculator.ts` (no
      re-export shim — all consumers updated above).
- [ ] 4.6 Run `yarn vitest run tests/integration/db/models/disasterRecordCostRecalcOnDelete.test.ts`
      and `yarn vitest run tests/integration/db/services/disasterEventCostRollupService.test.ts`
      and confirm all pass.

## 5. Refactor

- [ ] 5.1 Re-read `app/backend.server/services/disasterEventCostRollupService.ts` for naming
      clarity and consistent parameter ordering (`tx` first, matching every other model/service
      function in the codebase).
- [ ] 5.2 Confirm no implementation detail leaked into
      `specs/disaster-event-cost-rollup-service/spec.md` that isn't already there; re-read the
      spec and verify every scenario still holds after the refactor pass.
- [ ] 5.3 Re-run both new test files to confirm green after refactor:
      `yarn vitest run tests/integration/db/services/disasterEventCostRollupService.test.ts`
      `yarn vitest run tests/integration/db/models/disasterRecordCostRecalcOnDelete.test.ts`

## 6. Quality Gates

- [ ] 6.1 Gate 1 — Tests green: both new test files pass, zero skipped.
- [ ] 6.2 Gate 2 — TypeScript clean: `yarn tsc` reports zero errors, including at the four updated
      call-site files and the deleted-file's former import paths.
- [ ] 6.3 Gate 3 — Prettier clean: `yarn format:check` (run `yarn format` first if needed).
- [ ] 6.4 Gate 4 — Anti-pattern review: check `.github/skills/anti-pattern-check/SKILL.md` against
      the new service file and the four modified call-site files.
- [ ] 6.5 Gate 5 — SOLID review: invoke the `solid-reviewer` agent on
      `app/backend.server/services/disasterEventCostRollupService.ts`. Confirm Single
      Responsibility (the service only rolls up costs, it does not own tenant scoping or
      validation), and Dependency Inversion (callers depend on the two named entry points, not on
      the four internal calculators).
- [ ] 6.6 Gate 6 — Documentation review: comments explain WHY, not WHAT — in particular the
      recovery-cost fallback logic (Decision 4's invariant) and the concurrent-recalculation
      limitation (design.md Risks) need a short comment pointing at the design doc, not a restated
      code walkthrough.
- [ ] 6.7 Gate 7 — Project conventions review: cross-check against `.github/copilot-instructions.md`
      — file naming (no `.server.ts` suffix needed unless the file imports server-only modules;
      confirm whether Drizzle imports require it), Prettier formatting, no `as any`.
- [ ] 6.8 Gate 8 — Code review: run `.github/skills/code-review/SKILL.md` in full on the new
      service file, the new test files, and the four modified call-site files. Address all
      findings before proceeding.
- [ ] 6.9 Gate 9 — Visual/UX parity review: not applicable — this change has no presentation-layer
      or route-rendered-output component. Confirmed N/A per design.md (no `fieldsDef` impact, no
      route changes).

## 7. Regression

- [ ] 7.1 Run the full PGlite suite: `yarn test:run2`. All tests that passed before this change
      MUST still pass, including the existing real-DB route tests'
      counterparts (`tests/integration-realdb/routes/disaster-record/damages/delete.$id.test.ts`
      and the `disruptions` equivalent remain real-DB tier and out of scope for `test:run2`, but
      MUST NOT be broken by the import/rename changes — verify by reading their imports, since
      `yarn test:run2` will not execute them).
- [ ] 7.2 If any failures appear, verify they are pre-existing by checking out the base branch and
      re-running the same suite before archiving. Do not archive until the suite is green or all
      failures are confirmed pre-existing.

## 8. Archive and PR

- [ ] 8.1 Tick all checkboxes in this tasks.md (including this one) so the incomplete-task guard
      does not block the archive step.
- [ ] 8.2 Run `/opsx:archive` on the implementation branch to finalise the OpenSpec change
      artifacts and mark the change complete.
- [ ] 8.3 Raise a PR targeting `dev` with title:
      `Refactor: extract disaster event cost rollup into a shared domain service`
