## Why

`4b` (`CreateHazardousEventUseCase`), `4c` (`UpdateHazardousEventUseCase`), `4d`
(`GetHazardousEventByIdUseCase`), and `4g` (`RecordSpatialObservationUseCase`) are real,
shipped, mock-tested use cases, but nothing in the new Clean Architecture application
layer can list `HazardousEvent`s for a tenant. This change adds `ListHazardousEventsUseCase`,
the paginated read-path counterpart the roadmap's own `4e` names, needed before any
route/controller (Phase 6) can expose a list view.

**Ground-truth findings relative to the roadmap's own shorthand intent text, not assumed:**

1. **`IHazardousEventRepository.findAll(tenantId, pagination)` already exists and is
   already tenant-scoped and paginated** (`IHazardousEventRepository.ts` line 28, resolves
   a plain `HazardousEvent[]`, no total-count/envelope — `Pagination`'s own shape is
   `{ page: number; pageSize: number }` only, `app/shared/types/Pagination.ts`). No new
   port method is needed.
2. **`IWorkflowRepository.findByEntityIds(entityIds, entityType)` already exists, already
   batched, and its omission-not-null contract is proven at the port-contract level, not
   just documented**: `IWorkflowRepository.test.ts` line 57, "returns only the instances
   that exist, omitting a missing one in the middle" — a real, passing test, not a doc
   comment taken on faith. No new port method is needed; this change is the first real
   use-case caller of a previously-dormant method.
3. **`HazardousEventDto`/`toHazardousEventDto` requires a non-null `WorkflowInstance` as
   its mandatory second parameter** (`HazardousEventDto.ts` line 46/52) and has exactly
   two existing call sites (`CreateHazardousEvent.ts`, `UpdateHazardousEvent.ts`) plus one
   indirect one (`HazardousEventDetailDto.ts`, via `toHazardousEventDto`), none of which
   can tolerate a missing `WorkflowInstance`. **A batched `findByEntityIds` call can omit
   rows** — unlike `4d`'s single-row `findByEntity`, which `4d` already treats as a
   defensive `NotFoundError` (`DEF-031`) precisely because it never had to handle "missing
   for some rows, present for others" within one response.

**Decision already made by the user (not reopened here):** some `HazardousEvent` rows on
a page will have no corresponding `WorkflowInstance` — the same root cause `DEF-031`
already names (Phase M's backfill). **Note on Phase M's own current status, flagged for
the record rather than asserted as fact:** the roadmap heading itself labels Phase M
"execution not started," dated 2026-09-01 — but that exact same dated label still appears
on this very Phase 4's own heading despite real Phase 4 use cases (`4b`-`4e`) already
shipped, so the label is a point-in-time planning annotation, not a live status tracker,
and cannot be trusted at face value for Phase M either. Per project memory, Phase M's
backfill is a parallel workstream owned by a different team member — this change does not
depend on Phase M's actual current status (it handles a missing `WorkflowInstance` as data
regardless of cause or how many rows are actually still affected), but whoever reviews
`DEF-031`'s widened entry should confirm Phase M's real status with that owner before
treating this as still-latent, rather than relying on the roadmap's own stale heading. Two
alternatives were explicitly rejected: silently excluding such rows (hides real data,
defeats migration-progress visibility, and can undercount a page below `pageSize` even
when more rows exist on a later page); and failing the whole page if any single row lacks
a `WorkflowInstance` (one legacy row would break the list for every user during exactly
the transition period this is expected in). **Chosen instead:** a new, additive
`HazardousEventListItemDto` with `workflowStatus: Status | null` (nullable) — a row whose
id is missing from `findByEntityIds`'s result still appears, with all its real fields,
`workflowStatus: null` meaning "migration-pending/missing, not yet determined." This
mirrors `4d`'s own additive-DTO precedent in spirit (new DTO, new type, zero change to
`toHazardousEventDto`'s own exported signature or behavior, zero change to its two
existing call sites) — not a widening of the existing, mandatory-`workflowStatus`
`HazardousEventDto` (that was explicitly rejected, same blast-radius reasoning as `4d`'s
own decision).

**One structural difference from `4d`'s own additive-DTO mechanics, resolved in
design.md Decision 2/3, not silently assumed to transfer:** `4d`'s `HazardousEventDetailDto`
only ever *adds* a field via `interface ... extends HazardousEventDto` and a mapper that
spreads `toHazardousEventDto`'s own output. This change needs to *widen* an existing field
(`workflowStatus`) from mandatory to nullable — `extends HazardousEventDto` directly cannot
widen that one property (TypeScript rejects it; Decision 2 resolves this via `extends
Omit<HazardousEventDto, "workflowStatus">` instead), and the spread-based mapper pattern
cannot run for a row with no `WorkflowInstance` at all, since `toHazardousEventDto` has no
nullable-input signature. **Human-reviewer decision on the mapper (Decision 3, superseding
this document's own earlier default of a field-by-field duplication):** rather than
reimplementing `toHazardousEventDto`'s field-mapping logic a second time, a small, internal
`mapHazardousEventFields(event)` helper is extracted inside `HazardousEventDto.ts` itself
and shared by both `toHazardousEventDto` and the new `toHazardousEventListItemDto` —
`toHazardousEventDto`'s own exported signature and behavior stay unchanged (its existing
test suite, `HazardousEventDto.test.ts`, is the regression proof and is not itself
modified), so this is a narrower, behavior-preserving touch to `HazardousEventDto.ts`, not
the kind of external-contract change the original "zero changes" framing was protecting
against. See design.md Decision 3 for the full reasoning.

## What Changes

- Add `ListHazardousEventsUseCase` (`execute(query)`) that: loads a tenant-scoped,
  paginated page of events via `IHazardousEventRepository.findAll(query.tenantId, {
  page: query.page, pageSize: query.pageSize })`; collects every id on that page; makes
  **exactly one** batched `IWorkflowRepository.findByEntityIds(ids, "HE")` call (skipped
  entirely when the page is empty — design.md Decision 4) to attach current workflow
  status — never a per-row lookup; joins the two results by id (not by position — the
  batched call can omit and reorder); and returns a `HazardousEventListItemDto[]`
  preserving `findAll`'s own row order. Returns `[]`, not an error, for a tenant with no
  events.
- Add `ListHazardousEventsQuery { tenantId: string; page: number; pageSize: number }` —
  matches `ListNoticesQuery`'s own established shape for this exact use-case type
  (`app/domains/notices/application/use-cases/ListNotices.ts`). Following that same,
  already-settled precedent, `page`/`pageSize` are **not** validated or clamped at this
  layer — `ListNoticesUseCase` performs no such validation either; that responsibility
  belongs to the presentation layer (Notices' own `parsePagination.ts`,
  `app/domains/notices/presentation/parsePagination.ts`, confirmed directly: parses,
  defaults, and caps `page`/`pageSize` from the URL before any use case is called). This
  change's own future route (Phase 6, not yet built) owns the equivalent for
  hazardous-events.
- Add `HazardousEventListItemDto`/`toHazardousEventListItemDto` in a new file,
  `app/domains/hazardous-events/application/dto/HazardousEventListItemDto.ts` — an
  additive DTO whose `workflowStatus` is `Status | null`, distinguishing it from the
  existing, mandatory-`workflowStatus` `HazardousEventDto`. See design.md Decisions 2-3
  for the type shape and mapper. This DTO, its test file, the `DEF-031` register widening,
  and a small internal, behavior-preserving extraction inside `HazardousEventDto.ts`
  (Decision 3) are all additions/edits beyond the roadmap's own two-file stub
  (`ListHazardousEvents.ts`/`.test.ts` only, proposal.md Impact) — the same kind of
  addition `4d` made for its own `HazardousEventDetailDto`.

## Capabilities

### New Capabilities

- `list-hazardous-events`: `ListHazardousEventsUseCase` — fetches a tenant-scoped,
  paginated page of `HazardousEvent`s, enriches each row with its current workflow status
  where known (`null` when not yet determined), via exactly one batched workflow lookup
  per page, and returns a `HazardousEventListItemDto[]`.

### Modified Capabilities

<!-- None — no existing capability's requirements change. IHazardousEventRepository,
IWorkflowRepository, and HazardousEventDto/toHazardousEventDto's own exported behavior are
all reused exactly as already specified (the internal extraction inside
HazardousEventDto.ts, Decision 3, is a non-behavior-changing implementation detail, not a
requirement change); HazardousEventListItemDto is a new, additive capability, not a
modification to get-hazardous-event-by-id/update-hazardous-event/create-hazardous-event. -->

## Impact

**Files touched:**

- `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.ts` (new) — the
  use case
- `app/domains/hazardous-events/application/use-cases/ListHazardousEvents.test.ts` (new)
  — unit tests
- `app/domains/hazardous-events/application/dto/HazardousEventListItemDto.ts` (new) — the
  additive, nullable-`workflowStatus` DTO and its mapper
- `app/domains/hazardous-events/application/dto/HazardousEventListItemDto.test.ts` (new)
  — unit tests for the mapper
- `app/domains/hazardous-events/application/dto/HazardousEventDto.ts` (modified) —
  internal-only extraction of `mapHazardousEventFields(event)`, shared by
  `toHazardousEventDto` and the new `toHazardousEventListItemDto` (design.md Decision 3,
  human-reviewer decision). `toHazardousEventDto`'s own exported signature and behavior
  are unchanged; `HazardousEventDto.test.ts` is not modified and is the regression proof.
- `_docs/refactoring-plan/deferred-items-register.md` — widen the existing `DEF-031` row's
  own text to also name this use case's list-shaped manifestation of the same root cause
  and the chosen handling (nullable `workflowStatus`, not a thrown error); no new row, no
  other row touched; the roadmap's own `6f`/Phase M checkpoint notes are not touched
  (already cover this class of issue generally)

**DB migration:** None. `hazardous_event` and `workflow_instance` already exist. This
change is application/domain-layer TypeScript only — no schema change, no new port method.

**Test approach:** Unit only (Vitest, fake/mock `IHazardousEventRepository` and
`IWorkflowRepository`, spy/fake `ILogger`) — matches `4b`'s, `4c`'s, `4d`'s, and `4g`'s own
test tier (Phase 4 Gate: zero PGlite/DB dependency). No real adapter exists yet for either
repository port.

**Security / multi-tenancy:**

- `query.tenantId` scopes `findAll` directly (the port's own contract) — same-tenant-only
  by construction, no separate check needed.
- `IWorkflowRepository.findByEntityIds` has **no `tenantId` parameter at all** (confirmed
  directly: `IWorkflowRepository.ts` line 6, "caller's own repository scopes tenancy").
  This use case's tenant-scoping guarantee for that call comes entirely from passing it
  only the ids `findAll` itself already resolved for `query.tenantId` — never a
  caller-supplied id list. This is the same structural property `4d`'s design.md Decision
  3 already established for its own single-id `findByEntity` call, applied here to a
  batched list of ids instead of one.
- No write of any kind. Pure composition of two existing, tenant-respecting read paths.
