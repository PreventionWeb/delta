## Why

`app/domains/hazardous-events/` has real Phase 2 schema (`hazardousEventTable.ts`,
`hazardousEventSpatialObservationTable.ts` + its geom/division children) but no domain layer at
all — `domain/`, `application/ports/` are still empty `.gitkeep` placeholders. Track A's `3a`
(`WorkflowInstance` + `IWorkflowRepository`, already merged into `feature/he-ca-phase3`) exists
specifically so this entity's use cases can query approval status without carrying a redundant
status field of their own — closing the two-sources-of-truth drift Phase 0 finding 0c documented
in today's live system (`hazardousEventTable.approvalStatus`/`status`/`hazardousEventStatus` three-way
overlap, DEF-009). This change builds Track B's core aggregate so Phase 4's use cases have an
entity and port to depend on, and closes DEF-006 (empty-string-vs-null UUID crash) for the new
Clean Architecture path.

## What Changes

- Add a `HazardousEvent` domain entity (`app/domains/hazardous-events/domain/HazardousEvent.ts`)
  modeling `hazardous_event`'s real column set as a pure TypeScript class: private constructor,
  `HazardousEvent.create(props)` static factory. `create()` validates `tenantId`,
  `specificHazardId`, and `startDate` are present (non-empty), validates `startDate <= endDate`
  when both are set (today's live `hazardous_event_create_update.ts` ordering rule, carried
  forward — not invented), and normalizes an empty-string `createdByUserId`/`updatedByUserId`/
  `submittedByUserId` to `null` rather than throwing (DEF-006 fix).
- The entity carries **no approval-status field at all** — no `status`, `approvalStatus`,
  `validatedByUserId`/`validatedAt`, `publishedByUserId`/`publishedAt`. Those live entirely in
  `validation-workflow`'s `WorkflowInstance`, queried via `IWorkflowRepository` by whichever use
  case needs status (resolved design decision — avoids 0c's drift). `hazardousEventStatus`
  (`forecasted`/`ongoing`/`passed`) is retained — it is a physical/temporal classification, not an
  approval-workflow status, and is the one survivor of DEF-009's three-way overlap this change
  doesn't touch.
- The entity carries **no independent `hipHazardId`/`hipClusterId`/`hipTypeId`** — only
  `specificHazardId`. The new schema makes today's HIP-hierarchy consistency check structurally
  unrepresentable (resolved open decision #6); `getRequiredAndSetToNullHipFields` is not ported.
- `createdByUserId`, `updatedByUserId`, `submittedByUserId` are typed `string | null`, not
  non-nullable `string` — closes DEF-006 for this new path (today's `HazardousEventFields`
  interface still types `createdByUserId`/`updatedByUserId` as non-nullable `string`; that legacy
  interface is untouched by this change — see design.md for the precise DEF-006 scope).
- Define `IHazardousEventRepository` port (`findById`, `findAll`, `save`, `delete`,
  `findCurrentSpatialObservation`, `findSpatialObservationByTime`, `saveSpatialObservation`) in
  `application/ports/`. Spatial observations are a child of this aggregate, not their own
  aggregate root (one repository per aggregate root, standard DDD), so they're owned by this same
  port rather than a separate `ISpatialObservationRepository`. The three spatial methods use a
  minimal, provisional `SpatialObservationRecord` data shape (grounded in the real
  `hazardous_event_spatial_observation`/`_geom`/`_division` tables) that Phase 3d's own
  `SpatialObservation` domain entity is expected to supersede — flagged explicitly in design.md so
  the port signature is not mistaken for that entity's final shape.
- Zero framework dependencies anywhere in this change: no Drizzle, no NestJS, no Remix imports in
  `HazardousEvent.ts` or `IHazardousEventRepository.ts`.

**Not in scope for this change** (explicitly deferred, see design.md):

- No repository implementation (Drizzle adapter) — a later Phase 4/5 change, once
  `IHazardousEventRepository` exists for it to implement.
- No use case / NestJS wiring.
- No change to `hazardousEventTable.ts`, the spatial observation tables, or any other
  already-archived schema file — this change only reads them to ground the entity's shape.
- No modeling of attachments (neither the legacy `attachments` jsonb column nor the new
  `hazardous_event_attachment` table) — out of scope per the port's own method list; Phase 7 owns
  the jsonb column's cutover, and a normalized-attachment domain concept (if any) is a future
  change's job.
- No `event`-table relationship modeling — `HazardousEvent.id` is an FK-as-PK to `eventTable.id`
  in the live schema; this change models `hazardous_event`'s own columns only.
- No cycle-detection / causal-chain logic (`3c`) and no `SpatialObservation` child entity (`3d`) —
  both are separate, already-roadmapped changes.

## Capabilities

### New Capabilities

- `hazardous-event-entity`: `HazardousEvent` domain entity — construction, its validation rules
  (required-field, `""`-normalization, date-ordering), and read-only property access.
- `hazardous-event-repository-port`: `IHazardousEventRepository` interface — method signatures,
  tenant-scoping contract, and the spatial-observation methods' provisional data shape.

### Modified Capabilities

_(none — `hazardousEventTable.ts` and the spatial observation tables describe the DB shape and
are unchanged by this purely domain-layer addition)_

## Impact

- **Affected code:** two new production files —
  `app/domains/hazardous-events/domain/HazardousEvent.ts` and
  `app/domains/hazardous-events/application/ports/IHazardousEventRepository.ts` — plus their test
  files (`HazardousEvent.test.ts`, `IHazardousEventRepository.test.ts`). Nothing outside
  `app/domains/hazardous-events/` is touched; no existing file is modified.
- **DB migration:** none required. Pure TypeScript modeling already-shipped tables.
- **Test approach:** Unit tests only (Vitest, no PGlite import, no DB) — Phase 3 Gate (zero DB
  dependency in the domain tier). Covers: construction validation (required fields, `""`
  normalization, date ordering), read-only property access, and the port's method signatures plus
  a fake-repository conformance test for its documented contracts (matching `3a`'s
  `IWorkflowRepository.test.ts` precedent).
- **Security / multi-tenancy:** `IHazardousEventRepository`'s methods that read/write a specific
  row (`findById`, `findAll`, `delete`, and the three spatial methods) take an explicit `tenantId`
  parameter, matching `INoticeRepository`'s convention — this is the first HE-aggregate port, so
  its multi-tenancy contract is being set here, not inherited. This also directly addresses
  DEF-005 (spatial-footprint division linking has no tenant check): the port shape now carries a
  tenant source through to the spatial methods, though the actual tenant-scoped division-validity
  check itself remains Phase 3d's job to implement against a real adapter — see design.md and the
  register-bookkeeping flag below.
- **Deferred-items register bookkeeping (flag only, not edited by this change):**
  - DEF-006 — closed for the new Clean Architecture path (`HazardousEvent.ts`); the legacy
    `HazardousEventFields` interface (`app/backend.server/models/event/hazardous_event_create_update.ts`)
    is untouched and still types `createdByUserId`/`updatedByUserId` as non-nullable `string` until
    Phase 7's cutover. Register should record "closed for CA path, legacy path unchanged," not
    "resolved."
  - DEF-005 — this change fixes the _port shape_ (tenant parameter now exists on the spatial
    methods) but not the _check itself_ (no adapter exists yet to enforce it). Register's trigger
    for DEF-005 may need amending from "Phase 3d (SpatialObservation Child Entity) — not yet
    proposed" to "port shape fixed in `3b`; tenant-scoped division-validity check itself still
    `3d`'s job."
