## Why

No entry point exists yet to actually create a `HazardousEvent`. `HazardousEvent.create()`
(`3b`/`3e`) and `WorkflowInstance.create()` (`3a`) are both real, tested domain building
blocks, but nothing wires them together — `app/domains/hazardous-events/application/use-cases/`
and `application/dto/` hold only `.gitkeep` placeholders. `IHazardousEventRepository` has no
causality methods, and `assertCausalLinkDoesNotCreateCycle()` (`3c`) is a pure in-memory
function with no port behind it (`3c`'s own design.md: "not wired into any port, use case, or
route — expand-only rule"). This change adds `CreateHazardousEventUseCase`, the first real
caller of `IHazardousEventRepository.save()` and the second real caller of `IWorkflowRepository`
(after `4a`'s `ProcessWorkflowActionUseCase`, whose own design.md Decision 9 explicitly assigns
DRAFT-initialization to this use case).

**Scope correction (Phase 0 finding):** the roadmap's `4b` intent text describes validating "a
supplied parent's existence and tenant match" against a single `parentId` field. That field does
not exist — `HazardousEvent.create()` has no `parentId`. The real cause/effect relationship,
built afterward in `3c`, is a directed-edge model (`causeId`/`effectId` in
`hazardous_event_causality`, via `CausalChain.ts`). Per direct user confirmation, this change's
scope is expanded (not the roadmap's original file list) to include causal-chain linking: an
optional `causeId` on the create command, validated for existence and checked via
`assertCausalLinkDoesNotCreateCycle()` before a new `causeId -> effectId` edge is persisted. No
`ICausalChainRepository`-style port exists yet — this change defines it.

## What Changes

- Add `CreateHazardousEventUseCase` (`execute(command)`) that: constructs a `HazardousEvent` via
  `HazardousEvent.create()`; if `command.causeId` is supplied, validates the cause event exists
  and that the new link would not close a cycle; persists the `HazardousEvent`; initializes and
  persists a `WorkflowInstance` at `DRAFT`; persists the causal edge if one was supplied (in that
  order — see design.md Decision 5 for why); and returns a `HazardousEventDto`.
- Add `CreateHazardousEventCommand`, matching `CreateNoticeCommand`'s "omit generated fields"
  convention (`id`/`createdAt`/`updatedAt` are generated internally, not accepted).
- Add `HazardousEventDto` (new — only a `.gitkeep` exists today) and its mapper, including the
  newly-initialized workflow status so the roadmap's own test-tier expectation ("happy path
  returns DTO with a `DRAFT` status") is satisfiable.
- Add `ICausalChainRepository` (new port) — scoped-read (`findReachableEdgesFrom`) and single-edge
  write (`saveEdge`), not a whole-table load (per `3c` design.md's own warning against that).
  `CausalEdge` is reused from `3c`'s `domain/CausalChain.ts`, not redefined.
- Add `IHazardTaxonomyRepository` (new port) — tenant-scoped membership lookups for
  `hazardDriverIds`/custom-field-definition ids, closing the "no computation path" half of
  `DEF-021` (`HazardousEvent.create()`'s `validHazardDriverIds`/`validCustomFieldDefinitionIds`
  parameters have had no real caller until now).
- Both new ports are **interface-only in this change**, matching `IHazardousEventRepository`'s and
  `IWorkflowRepository`'s own "interface now, adapter later" split — no Drizzle adapter, no PGlite
  tier, for either `ICausalChainRepository` or `IHazardTaxonomyRepository`. Both are unit-tested via
  a fake-conformance implementation only (matching `4a`'s/`3c`'s own test tier). A real adapter for
  each is deferred to a future Phase 5 intent — this change had earlier folded real adapters into
  this same change per a since-reversed user decision; that decision is reverted here, per the
  standing "one OpenSpec intent at a time" preference and "no exceptions to phased gates."
- `causeId` tenant scoping is **settled, not open**: same-tenant-only
  (`hazardousEventRepository.findById(command.causeId, command.tenantId)`, design.md Decision 4
  step 5a) is this change's shipped behavior, not a provisional default awaiting review. `DEF-012`
  (cross-tenant causality access control — a genuine future need, e.g. a transboundary flood) stays
  open in the register; only the tenant-scoping choice _for this use case_ is closed.

## Capabilities

### New Capabilities

- `create-hazardous-event`: `CreateHazardousEventUseCase` — constructs and persists a
  `HazardousEvent`, optionally links it as the effect of an existing cause event, initializes its
  `WorkflowInstance` at `DRAFT`, and returns a `HazardousEventDto`.
- `causal-chain-repository-port`: `ICausalChainRepository` — the first persistence port for
  `hazardous_event_causality`, scoped-read + single-edge write only.
- `hazard-taxonomy-repository-port`: `IHazardTaxonomyRepository` — tenant-scoped existence lookups
  for `hazard_driver` and `hazard_type_custom_field_definition` ids, feeding
  `HazardousEvent.create()`'s mandatory valid-id-set parameters.

### Modified Capabilities

None. `IHazardousEventRepository` (`hazardous-event-repository-port`) and `IWorkflowRepository`
(`workflow-repository-port`) are consumed as-is, with no signature changes.

## Impact

**Files touched (all new, except one existing doc update noted below — no existing source file
under `app/` is modified):**

- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.ts` — the use case
- `app/domains/hazardous-events/application/use-cases/CreateHazardousEvent.test.ts` — unit tests
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` — DTO + mapper
- `app/domains/hazardous-events/application/dto/HazardousEventDto.test.ts` — mapper tests
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.ts` — new port
- `app/domains/hazardous-events/application/ports/ICausalChainRepository.test.ts` — fake
  conformance tests (matches `IHazardousEventRepository.test.ts`'s pattern)
- `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.ts` — new port
- `app/domains/hazardous-events/application/ports/IHazardTaxonomyRepository.test.ts` — fake
  conformance tests
- `_docs/refactoring-plan/deferred-items-register.md` — add `DEF-026` (three-write atomicity gap,
  targeted for `5k`); narrow `DEF-021` (real computation path exists, no adapter yet — not
  closed). Two SOLID/code-review findings were fixed rather than deferred — see design.md Risks.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` — updated ahead of this change
  (2026-09-24) to reflect the `parentId` -> `causeId`/`CausalChain` scope correction (this
  proposal's own Why section), mark `4a` shipped, split real adapters out to new `5i`/`5j`/`5k`
  Phase 5 sections

**DB migration:** None. `hazardous_event_causality`, `hazard_driver`, and
`hazard_type_custom_field_definition` all already exist (`2e`/`2f`/`2h`, all archived). This
change adds application-layer TypeScript only (two new port interfaces, one new use case, one new
DTO) — no schema change, no infrastructure-layer adapter querying these tables in this change.

**Test approach:** Unit only (Vitest, mock/fake repositories) for `CreateHazardousEventUseCase`,
`HazardousEventDto`, and both new ports' fake-conformance tests — matches `4a`'s and `3c`'s own
test tier. No PGlite tier in this change: neither new port has a real adapter, matching how
`IHazardousEventRepository` and `IWorkflowRepository` themselves remain interface-only with no
PGlite tier.

**Security / multi-tenancy:**

- `HazardousEvent.create()`'s own membership checks (`DEF-021`) are exercised for the first time
  by a real caller: `CreateHazardousEventUseCase` computes
  `validHazardDriverIds`/`validCustomFieldDefinitionIds` via `IHazardTaxonomyRepository`, a
  tenant-scoped port (`ids`/`tenantId` in, matching set out). This **narrows, but does not close**,
  `DEF-021`: the interface shape now has a real computation path and a real caller, but no adapter
  exists in this change to prove the query correct against real schema — that verification is
  deferred to the adapter's own future intent.
- **`causeId` tenant scoping is a settled decision, not an open item:** `hazardous_event_causality`
  has no `countryAccountsId` of its own; tenancy is only transitive through the two FK'd
  `HazardousEvent` rows. `DEF-012` documents a genuine real-world need for cross-tenant causal
  links (e.g. a transboundary flood) and **stays open in the register** — but _this use case's_
  `causeId` validation ships as same-tenant-only (`hazardousEventRepository.findById(causeId,
command.tenantId)` — the codebase's own standing "never fetch across tenants" rule, applied
  as-is, no exception), and that choice is final for this change (design.md Decision 4). A future
  intent that resolves `DEF-012` for real (e.g. a per-record sharing-grant mechanism) would need a
  new port method and a stated, deliberate exception to that standing rule — not a "flip a flag"
  change — exactly because this change's default closes it off by construction, the same
  discipline `DEF-021` already established.
- No route/auth-wrapper changes in this change — `CreateHazardousEventUseCase` is
  application-tier only, not yet wired to any `authActionWithPerm`-guarded route. That wiring is a
  later, unnamed intent's job, same as `4a`'s use case is still unwired to a route today.
