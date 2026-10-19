## Why

No entry point exists yet to change an already-persisted `HazardousEvent`. `4b`
(`CreateHazardousEventUseCase`) and `4g` (`RecordSpatialObservationUseCase`) are real, shipped,
mock-tested use cases, but nothing can edit an existing event's fields, change or clear its
causal link, or bundle a spatial reading into the same save the way the legacy web form's single
"save" button already does today. This change adds `UpdateHazardousEventUseCase`, the first use
case in this codebase to compose another use case as a constructor-level collaborator rather than
only repository/port dependencies, and the first use case whose cycle check is reachable (`4b`'s
own Decision 1 notes its create-time cycle check "can never fail" against a real adapter — an
update's effect node can already have real outgoing edges).

**Build-order note (already applied, 2026-09-30):** the roadmap lists this intent (`4c`) before
`RecordSpatialObservationUseCase` (`4g`), but `4c` depends on `4g` existing to delegate to. `4g`
shipped first (2026-10-01) specifically to unblock this change. No further build-order action
needed here.

**Terminology correction (matches `4b`'s own correction):** "the parent" in the roadmap's intent
text means `causeId`, not a `parentId` field. This change reuses `4b`'s `ICausalChainRepository`
port and `assertCausalLinkDoesNotCreateCycle()` (`3c`) exactly as `4b` does, and extends the same
same-tenant-only `causeId` scoping decision `4b`'s design.md Decision 4 already settled for
`DEF-012` — not reopened here.

**Four corrections found during Phase 0 ground-truth verification (not assumed — read against
the shipped code and the live legacy model):**

1. **`HazardousEvent.ts` has no `update()` method.** Only `static create()`, with a private
   constructor. This use case reconstructs via `create()` again with the existing entity's props
   merged against the command's changed fields — the same full-reconstruction pattern `4g`
   established for `SpatialObservation`'s replace semantics. `create()` still requires
   `validHazardDriverIds`/`validCustomFieldDefinitionIds` as mandatory sets, so this use case
   re-resolves them against the **merged** (not the command's own partial) `hazardDriverIds`/
   `customFieldValues` — the existing entity's cached ids are never assumed still valid.
2. **The real legacy `hazardousEventUpdate` (`app/backend.server/models/event.ts:785-1009`) uses
   `fields: Partial<HazardousEventFields>`** — a genuine partial-patch contract, not a
   full-collection resubmit. An omitted field leaves the stored value unchanged; a present field
   (including an explicit `null` for a nullable one) replaces it. `UpdateHazardousEventCommand`
   mirrors this exactly: every field is optional, `undefined` means "leave unchanged." This
   directly resolves this intent's own open design question in the roadmap/briefing about
   optional-vs-full-replace — confirmed from the real legacy function signature, not guessed.
3. **Legacy's own `fields.parent` handling supports clearing, not only setting/changing**
   (`event.ts:937-956`: `fields.parent !== undefined` always deletes the existing
   `event_relationship` row first, then conditionally re-inserts only if `fields.parent` is
   truthy — confirmed via Phase 0 audit finding 0a#5, "setting `parent: null` clears it with no
   replacement"). This resolves this intent's other open design question: `causeId` is a tri-state
   command field (`undefined` = unchanged, `null`/`""` = clear, a string = set/replace), not a
   two-state one.
4. **The temporal-causality check does not exist anywhere in the new domain layer yet**
   (`CausalChain.ts` only has the cycle check). Read directly from legacy
   (`validateTemporalCausality`, `event.ts:1425-1506`, and `parseFlexibleDate`,
   `app/backend.server/utils/dateFilters.ts:9-42`) rather than assumed, and the exact date format
   enforced is now also the PM/team-confirmed accepted format per ADR-002's "Partial and
   Uncertain Dates" section (`_docs/decisions/ADR-002-timezone-handling.md`, confirmed
   2026-10-01: `YYYY-MM-DD`/`YYYY-MM`/`YYYY`, zero-padded — `"2026-9-1"` is explicitly named as
   not valid):
   - Compares **only `startDate` on both sides** (cause and effect); `endDate` is fetched by
     legacy but never used in the comparison.
   - Rule is `causeStartDate <= effectStartDate` — equality allowed.
   - **Legacy's own comparison is not raw** — `validateTemporalCausality` (`event.ts:1481-1485`)
     floor-pads both `startDate`s via `normalizeDateForComparison` (`event.ts:1513-1537`,
     `YYYY`→`YYYY-01-01`, `YYYY-MM`→`YYYY-MM-01`) before comparing. **Correction (post-review,
     2026-10-01):** this document originally ported the rule as a direct raw-string comparison,
     claiming it "provably equivalent" to legacy's normalized one. A reviewer found that claim
     false (a longer, more-precise date that is a literal prefix-extension of a shorter one, e.g.
     `"2020-01-01"` vs. `"2020"`, diverges) — the port now floor-pads both sides, exactly matching
     legacy, confirmed by direct enumeration (design.md Decision 7).
   - **If either date fails the same zero-padded `YYYY`/`YYYY-MM`/`YYYY-MM-DD` format legacy's
     parser enforces, the check is a no-op** (not a block) — confirmed empirically (see
     design.md) that this exact permissiveness (e.g. day-overflow strings like `"2026-02-30"`
     rolling over silently in `new Date()` rather than failing) must be preserved, not tightened.
   - This check only ever ran on update, never on create (Phase 0 finding 0b#5) — a brand-new
     event can't already violate temporal causality against itself. This asymmetry is expected,
     not a gap `4b` should have closed.

**DEF-020 closes narrowly as part of this change** (not via the separate, much larger ADR-002
date-precision migration, `DEF-028`, out of scope here): the same zero-padded-format validation
above is applied **both** to the new cross-event temporal check **and** to
`HazardousEvent.create()`'s own existing `startDate`/`endDate` ordering comparison, which
currently has no format check at all. Both checks now also **normalize** before comparing, not
just format-gate: Decision 7's cross-event check floor-pads both sides (both operands are
startDates); Decision 8's intra-event check floor-pads `startDate` (a lower bound) and
ceiling-pads `endDate` (an upper bound) directionally, porting
`app/backend.server/utils/dateFilters.ts:60-75`'s `createDateCondition` precedent — the same
directional padding already used elsewhere in this codebase for disaster-date range filtering,
applied here to one event's own two bounds instead of a DB range filter. This is a deliberate,
user-approved behavior change from today's raw string comparison (confirmed directly with the
user, not a default "no behavior change" assumption) — see design.md Decision 8 for why the fix is
"skip the comparison when either date doesn't parse," not "reject a malformed date," which matters
because `create()` is also how a future real adapter will reconstruct existing (possibly
non-zero-padded) legacy rows.

## What Changes

- Add `UpdateHazardousEventUseCase` (`execute(command)`) that: loads the existing event and its
  `WorkflowInstance` (same-tenant-scoped, `NotFoundError` on miss); merges the command's defined
  fields over the existing entity's props (partial patch, Correction 2); re-resolves
  `validHazardDriverIds`/`validCustomFieldDefinitionIds` against the **merged** collections;
  reconstructs via `HazardousEvent.create()` (propagates `ValidationError` for any shape/ordering
  violation); when `causeId` is being set/changed, runs the cycle check
  (`assertCausalLinkDoesNotCreateCycle`, `3c`) and the new temporal-order check before persisting;
  persists the updated event; applies the causal-link change (clear, replace, or no-op) via
  `ICausalChainRepository`; when the command bundles a spatial reading, delegates to
  `RecordSpatialObservationUseCase` (`4g`) internally rather than duplicating its conflict/replace
  logic; and returns a `HazardousEventDto`.
- Add a new domain function to `CausalChain.ts`: `assertCauseStartsNoLaterThanEffect(causeStartDate,
  effectStartDate)` — the temporal-order check from Correction 4, throwing `ConflictError` (same
  categorization as the cycle check, not `ValidationError` — both are "conflicts with existing
  data," not malformed shape). Compares both sides **floor-padded** (not raw), exactly porting
  legacy's own `normalizeDateForComparison` (design.md Decision 7).
- Add a new Shared Kernel module porting legacy's own date-format/normalization rules: a boolean
  predicate (`isValidFlexibleDateFormat`, porting `parseFlexibleDate`'s exact format rule) plus two
  normalizers (`normalizeFlexibleDateFloor`, `normalizeFlexibleDateCeiling`, porting
  `normalizeDateForComparison`/`createDateCondition`'s own directional padding). Lives at
  `app/domains/shared/domain/flexibleDateFormat.ts` — a DDD Shared Kernel (a domain rule
  deliberately shared across bounded contexts, distinct from `app/shared/`'s own technical
  cross-cutting infrastructure per ADR-009), nested under `domain/` to follow the same per-context
  layering as `hazardous-events`/`notices`/`validation-workflow`, and specifically so a future
  Disaster Records/Disaster Events migration can reuse it without duplication (`DEF-029`). Imported
  by both `HazardousEvent.ts` (its existing ordering check) and `CausalChain.ts` (the new temporal
  check) — one consistent rule in both places, not two ad hoc copies (see design.md Decision 1).
- Modify `HazardousEvent.create()`'s existing `startDate`/`endDate` ordering check to skip (not
  reject) the comparison when either date fails the new format check, and to compare
  **floor(startDate) > ceiling(endDate)** rather than raw strings when both do — **BREAKING in the
  sense that it changes observable validation behavior** (DEF-020's own narrowing, plus a
  user-approved normalization improvement beyond DEF-020's original scope, design.md Decision 8),
  not breaking any type signature.
- Add `ICausalChainRepository.deleteCauseEdges(effectId)` — removes every stored edge where
  `effectId` is the effect. This codebase's causal-link model is singular per effect in every use
  case built so far (`4b`'s and this change's own command shape each carry exactly one `causeId`
  field); the underlying table has no `UNIQUE` on the effect column, so this method deletes all
  matching rows defensively rather than assuming exactly one exists (design.md Decision 5).
- `UpdateHazardousEventCommand`'s `spatialObservation` field is
  `Omit<RecordSpatialObservationCommand, "tenantId" | "hazardousEventId">` — those two fields are
  always supplied by this use case itself from the already-validated command/event, never by the
  caller directly (design.md Decision 6).

## Capabilities

### New Capabilities

- `update-hazardous-event`: `UpdateHazardousEventUseCase` — merges field changes into an existing
  `HazardousEvent`, re-validates the causal link (cycle + temporal order) when it changes, and
  optionally delegates a bundled spatial reading to `RecordSpatialObservationUseCase`.

### Modified Capabilities

- `hazardous-event-entity`: the `startDate`/`endDate` ordering check inside
  `HazardousEvent.create()` now skips the comparison (does not throw) when either date fails the
  zero-padded-format validation, and otherwise compares `startDate` floor-padded against `endDate`
  ceiling-padded (directional normalization, porting `createDateCondition`'s precedent) instead of
  performing a raw string comparison on any non-empty value (DEF-020).
- `hazardous-event-causal-chain`: adds `assertCauseStartsNoLaterThanEffect`, the temporal-order
  rule between a cause and effect event's `startDate` values (both floor-padded before comparing,
  porting `normalizeDateForComparison`), alongside the existing cycle check.
- `causal-chain-repository-port`: adds `deleteCauseEdges(effectId)` to `ICausalChainRepository`.
- `create-hazardous-event`: `CreateHazardousEventUseCase.execute()` now validates
  `command.actingUserId` is present before any write, the same gap found and fixed in
  `UpdateHazardousEventUseCase` during this change's own review.

## Impact

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.ts` (new) — the use
  case
- `app/domains/hazardous-events/application/use-cases/UpdateHazardousEvent.test.ts` (new) — unit
  tests
- `app/domains/hazardous-events/domain/CausalChain.ts` (modified) — adds
  `assertCauseStartsNoLaterThanEffect`
- `app/domains/hazardous-events/domain/CausalChain.test.ts` (modified) — new test scenarios
- `app/domains/shared/domain/flexibleDateFormat.ts` (new) — Shared Kernel zero-padded-date format
  predicate plus floor/ceiling normalizers (not nested under the HE domain — design.md Decision 1,
  `DEF-029`)
- `app/domains/shared/domain/flexibleDateFormat.test.ts` (new) — unit tests, including the
  empirically-confirmed day-overflow/year-range boundary cases and the floor/ceiling worked
  examples (design.md Decision 1)
- `app/domains/hazardous-events/domain/HazardousEvent.ts` (modified) — ordering check now
  format-gated and floor/ceiling-normalized (DEF-020)
- `app/domains/hazardous-events/domain/HazardousEvent.test.ts` (modified) — extends the existing
  "Date ordering" describe block with format-gating and mixed-precision normalization scenarios
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` (modified) — adds
  `deleteCauseEdges`
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` (modified) —
  fake conformance test for the new method
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` (modified) — adds
  `command.actingUserId` validation, the same gap found and fixed in
  `UpdateHazardousEventUseCase` during this change's own review
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` (modified) —
  new test scenarios for the above
- `_docs/refactoring-plan/deferred-items-register.md` — remove `DEF-020`'s row entirely (fully
  resolved by this change's format-gated, normalized comparison, per the register's own standing
  "remove an entry once it's picked up and resolved" convention; the full ADR-002 precision-enum
  migration, `DEF-028`, stays open and separate, and its own cross-reference to `DEF-020` is
  updated accordingly) and add `DEF-029` (Disaster Records' own non-zero-padded date matching, a
  separate out-of-scope finding surfaced during this review, recorded for its own future CA
  migration)

**DB migration:** None. `hazardous_event_causality` and `hazardous_event` both already exist. This
change is application/domain-layer TypeScript only.

**Test approach:** Unit only (Vitest, mock/fake repositories and a fake
`RecordSpatialObservationUseCase` collaborator) — matches `4b`'s and `4g`'s own test tier (Phase 4
Gate: zero PGlite/DB dependency).

**Security / multi-tenancy:**

- `id` (the event being updated) and any `causeId` being set are each validated against
  `command.tenantId` via `IHazardousEventRepository.findById()` — same-tenant-only, `NotFoundError`
  on a missing or cross-tenant id, reusing `4b`'s already-settled `DEF-012` scoping decision
  unchanged.
- No route/auth-wrapper changes — application-tier only, same scope as `4b`'s and `4g`'s own
  changes.
- **Flagged for a joint decision, not resolved in this change:** this is the first use case where
  two already-existing events' causal relationship can be concurrently re-pointed (e.g. two
  simultaneous updates setting A→B and B→A), which can write a real cycle under a
  read-then-write race neither call observes alone. `3c`'s own design.md Risks already named this
  exact race in the abstract ("a property of whatever future use case loads edges and persists a
  new one") — this change is that use case. See design.md Risks for the mandatory concurrent-callers
  test this change adds to prove propagation (not prevention), and the recommendation on whether
  `DEF-024`'s register text should be widened to name it concretely.
