## Context

See proposal.md - Why for motivation. This covers only what shapes the entity/port design.

The sole source of truth for this entity's shape is the real, already-shipped
`hazardousEventTable` (`app/drizzle/schema/hazardousEventTable.ts`) plus the Phase 2 spatial
observation tables (`app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts`
and its `_geom`/`_division` children). Both were read directly for this design — no field is
invented.

`hazardousEventTable`'s real column set, grouped:

- `id` — FK-as-PK to `eventTable.id`. This change models `hazardous_event`'s own columns only;
  the `event` relationship is a later phase's concern.
- `countryAccountsId: uuid` — **nullable at the DB level** (no `.notNull()`). Tenant validation is
  not enforced by the schema today; the roadmap's "validates tenant... present" instruction closes
  a real gap, not a redundant check.
- `specificHazardId: uuid` — also **nullable at the DB level**, same story.
- `...hipRelationColumnsRequired()` (`hipHazardId`, `hipClusterId`, `hipTypeId`) — excluded per
  resolved open decision #6 (roadmap). Not ported.
- `...approvalFields` (`approvalStatus`) and `...approvalWorkflowFields` (`createdByUserId`,
  `updatedByUserId`, `submittedByUserId`, `submittedAt`, `validatedByUserId`, `validatedAt`,
  `publishedByUserId`, `publishedAt`) — `approvalStatus`, `validatedByUserId`/`validatedAt`,
  `publishedByUserId`/`publishedAt` are excluded entirely (status/validation/publish attribution
  now lives on `WorkflowInstance`). `createdByUserId`/`updatedByUserId`/`submittedByUserId` are
  kept, per the roadmap's explicit list, typed `string | null`. `submittedAt` is **also kept**,
  paired with `submittedByUserId` (user decision, see Decision 4) — typed `Date | null`, matching
  the column's real nullable, non-`withTimezone` `timestamp()` type.
- `status: text` (DB column, separate from `approvalStatus`) — excluded; this is the third leg of
  DEF-009's three-way overlap (`status`/`approvalStatus`/`hazardousEventStatus`), and the roadmap's
  "no approval-status field at all" applies to it the same as `approvalStatus`.
- `nationalSpecification`, `description`, `chainsExplanation`, `magnitude` (DB column name is
  literally `magniture` — a pre-existing typo; the domain prop stays `magnitude`, the typo is not
  "fixed" here), `recordOriginator`, `dataSource` — all `zeroText()` (`text().notNull().default("")`).
  Kept as required `string` domain props matching the column's real nullability.
- `startDate`, `endDate` — also `zeroText()` (`text`, not `timestamp`/`timestamptz`). Kept as
  `string`, not `Date` — the column stores date-like text, not a real timestamp; inventing a
  `Date` type here would not be grounded in the schema.
- `hazardousEventStatus: text (enum: forecasted|ongoing|passed)` — nullable, no default. Kept.
- `specificHazardLocalName`, `specificHazardNationalName` — plain nullable `text` (not `zeroText`,
  per the schema's own comment: "unpopulated must stay distinguishable from empty string"). Kept
  as `string | null`, not normalized.
- `attachments: jsonb` — excluded (proposal.md "Not in scope").
- `apiImportId` (from `apiImportIdField()`) — nullable `text`. Kept as `string | null`; needed for
  future import-dedup use cases and carries no validation burden.
- `createdAt: timestamp` (`.notNull()`), `updatedAt: timestamp` (**no `.notNull()`** —
  schema-faithful typing is `createdAt: Date`, `updatedAt: Date | null`, unlike `WorkflowInstance`
  where both were genuinely non-null in its own table). Both columns are legacy `timestamp()`
  without `withTimezone` (predates ADR-002); out of scope for a domain-only change that doesn't
  touch the schema file.

Existing precedent followed: `app/domains/notices/domain/Notice.ts` (private constructor, single
validated static factory, read-only getters) and `app/domains/validation-workflow/domain/WorkflowInstance.ts`
(full real-column-set grounding, `ValidationError`/`ConflictError` split, defensive Date cloning).
For the port, `app/domains/notices/application/ports/INoticeRepository.ts` is the closer precedent
than `IWorkflowRepository.ts`: `HazardousEvent` (like `Notice`) carries its own tenant field and is
looked up by tenant-scoped queries, whereas `WorkflowInstance`'s table has no tenant column at all.
`IHazardousEventRepository` therefore adopts `INoticeRepository`'s tenancy convention: an explicit
`tenantId` parameter on every read/delete method, implicit via the entity on `save`.

Also read: `app/backend.server/models/event/hazardous_event_create_update.ts` (today's live
validation function) and `app/domains/hazardous-events/infrastructure/hazardousEventSpatialObservationTable.ts`
plus its `_geom`/`_division` siblings, to ground the spatial-observation port methods' data shape.

## Goals / Non-Goals

**Goals:**

- Define `HazardousEvent` as an immutable, framework-free domain entity whose factory closes three
  real gaps the current schema/code leaves open: tenant/specificHazardId/startDate presence (not
  enforced at the DB level today), the `""`-vs-`null` UUID crash (DEF-006), and carries forward
  the one real invariant today's `validate()` does enforce (`startDate <= endDate`) so this
  rewrite does not silently regress it.
- Define `IHazardousEventRepository` with `findById`, `findAll`, `save`, `delete`,
  `findCurrentSpatialObservation`, `findSpatialObservationByTime`, `saveSpatialObservation` — one
  repository per aggregate root, spatial observations included since they're a child of this
  aggregate, not their own root.
- Zero DB/framework imports in either new file, verified by `yarn tsc` and by the test tier itself
  (unit only, no PGlite import — Phase 3 Gate).

**Non-Goals:**

- No Drizzle adapter implementing `IHazardousEventRepository`.
- No use case, no NestJS module wiring.
- No `SpatialObservation` domain entity (`3d`) — the port's three spatial methods use a minimal
  provisional shape (Decision 5) that `3d` supersedes.
- No cycle-detection domain logic (`3c`).
- No attachment modeling of any kind (Decision 8).

## Decisions

### 1. Immutable entity: private constructor, single validated `create()` factory

Matches `Notice`/`WorkflowInstance`. `HazardousEventProps` fields are `readonly`;
`HazardousEvent.create(props)` is the only construction path. No transition methods exist on this
entity (unlike `WorkflowInstance`) — `HazardousEvent` has no state machine of its own; its
lifecycle events (submit/validate/approve/publish) are `WorkflowInstance`'s job entirely. A future
use case that edits a field (e.g. `description`) reconstructs via `create()` with the changed
prop, the same pattern `Notice`'s update use case follows.

### 2. `create()` validates presence of `tenantId`, `specificHazardId`, `startDate` — closing a real DB-level gap, not a redundant check

`countryAccountsId` and `specificHazardId` are both nullable at the DB level today (no
`.notNull()` on either column) — the schema does not guarantee their presence. `startDate` is a
`zeroText()` column (`NOT NULL DEFAULT ''`), so an absent value is representable as `""`. `create()`
treats an empty string the same as a genuinely missing value for all three fields and throws
`ValidationError` (from `~/shared/errors`, matching `Notice`/`WorkflowInstance`'s error choice for
malformed input) if any is empty/missing.

**On "dates are present" (plural) — resolved by the user 2026-09-16: `startDate` required,
`endDate` optional.** The roadmap's 3b intent text says "validates tenant, specificHazardId, and
dates are present" without specifying whether "dates" means `startDate` alone or both
`startDate`/`endDate`. `endDate` may be empty (`""`), matching `hazardousEventStatus`'s
`forecasted`/`ongoing` values, where an event legitimately has no end date yet — and a forecasted
event may not even have a firm `startDate` yet either, but the requirement isn't clear enough on
that case to loosen `startDate`'s own presence check, so it stays required per the roadmap's
literal text. This is also consistent with today's live `validate()`
(`hazardous_event_create_update.ts:64-91`), which never requires either date unconditionally — it
only checks that if one of `startDate`/`endDate` is being set in a partial update, both must be
present together, and that `startDate <= endDate` when both are set. Requiring `startDate`
unconditionally at construction is a **deliberate tightening** relative to today's live behavior,
not a port of it — confirmed acceptable by the user, not a silent widening.

### 3. `create()` validates `startDate <= endDate` when both are set — carried forward from live behavior, not invented

`hazardous_event_create_update.ts:81-89` enforces this today (`common.field_start_before_end`).
The roadmap's 3b intent text doesn't mention date ordering at all, but this is a real, currently
enforced invariant grounded in live code, not the roadmap's prose — dropping it here would be a
silent regression three phases before anyone would notice a hazardous event with `endDate <
startDate` slip through. `create()` throws `ValidationError` when both `startDate` and `endDate`
are non-empty and `startDate > endDate` (string comparison — the column is stored as date-like
text, so this matches the live code's own comparison, not a `Date`-based one).

### 4. Attribution fields: `createdByUserId`/`updatedByUserId` are `string | null`; `submittedByUserId`/`submittedAt` are kept as a pair; empty string is normalized to `null`, not rejected

Per the roadmap's explicit list and DEF-006. `create()` normalizes `""` to `null` for
`createdByUserId`/`updatedByUserId`/`submittedByUserId` rather than storing `""` — storing `""`
would just relocate DEF-006's UUID-parse crash into whatever adapter persists this entity later;
normalizing at the one choke point (`create()`) closes it by construction, matching the roadmap's
own "closed by construction, not a per-field patch" framing. This is the opposite rule from
Decision 2's required fields: absent tenant/specificHazardId/startDate is an error; absent
attribution is a normal, valid state (a system-imported record may have no known creator).

**`submittedAt` resolved by the user 2026-09-16: kept, paired with `submittedByUserId`.** The
roadmap's field list names only `createdByUserId`/`updatedByUserId`/`submittedByUserId`, not
`submittedAt` — every other attribution field on `WorkflowInstance` is a `ByUserId`/`At` pair, and
leaving `submittedByUserId` unpaired here would have been the one exception. User's own reasoning:
"if a record is submitted we should mark who did it and when" — so `submittedAt` is retained as
`submittedByUserId`'s pair, typed `Date | null` (matching the column's real nullable
`timestamp("submitted_at")` type, not `withTimezone` — same pre-ADR-002 gap as `createdAt`/
`updatedAt`, out of scope for this domain-only change). No normalization rule applies to
`submittedAt` itself (unlike the UUID fields, a `timestamp` column has no `""`-vs-`null` ambiguity
to close) — it is simply `null` when absent, a real `Date` when present. `validatedByUserId`/
`validatedAt`/`publishedByUserId`/`publishedAt` remain excluded (Decision 1/Context) — those stay
on `WorkflowInstance` only, unaffected by this decision.

### 5. `IHazardousEventRepository`'s spatial methods use a provisional `SpatialObservationRecord` shape, not a `SpatialObservation` domain entity

The roadmap's port method list (`findCurrentSpatialObservation`, `findSpatialObservationByTime`,
`saveSpatialObservation`) needs _some_ return/parameter type to compile, but the real
`SpatialObservation` domain entity is `3d`'s job, not this change's — building it here would be
scope creep into a separately roadmapped change and risks the two changes disagreeing on its final
shape. This design defines a minimal, explicitly-provisional `SpatialObservationRecord` type
(declared in `IHazardousEventRepository.ts` itself, not a new domain file) grounded in the three
real Phase 2 tables' actual columns: `id`, `hazardousEventId`, `observationTime: Date`
(`timestamptz`, genuinely a `Date` this time — unlike `hazardous_event`'s own `startDate`/`endDate`),
`note: string | null`, `geometries: unknown[]` (from `hazardousEventSpatialObservationGeomTable`,
one observation can have multiple geom rows; typed `unknown` since PostGIS geometry has no
meaningful TS shape without a library, matching the existing `geometryType` customType's own
`$type<unknown>()`), `divisionIds: string[]` (from `hazardousEventSpatialObservationDivisionTable`),
`createdAt: Date`, `updatedAt: Date`. A comment on the type makes explicit that `3d`'s
`SpatialObservation` entity is expected to supersede it, and the port's method signatures will
need updating when that lands — this is not this change's problem to solve, only to flag clearly
so a future reader doesn't mistake this shape for a finished domain model.

### 6. `IHazardousEventRepository`: explicit `tenantId` on every read/delete method and the spatial methods; implicit via the entity on `save`

Adopts `INoticeRepository`'s convention (the closer precedent — `HazardousEvent`, like `Notice`,
carries its own tenant field, unlike `WorkflowInstance`'s tenant-less table):

- `findById(id: string, tenantId: string): Promise<HazardousEvent>` — throws `NotFoundError`,
  matching `INoticeRepository.findById`'s throw-based contract (a `HazardousEvent` is expected to
  exist once its `id` is known, same reasoning as `Notice`).
- `findAll(tenantId: string, pagination: Pagination): Promise<HazardousEvent[]>` — tenant-scoped
  list, matching `INoticeRepository.findAll`.
- `save(entity: HazardousEvent): Promise<HazardousEvent>` — insert-or-update; the entity's own
  `tenantId` property carries tenancy, no separate parameter.
- `delete(id: string, tenantId: string): Promise<void>` — tenant-scoped delete.
- `findCurrentSpatialObservation(hazardousEventId: string, tenantId: string): Promise<SpatialObservationRecord | null>`
  — the latest-by-`observationTime` reading (the "current observation" rule `3d` will formally
  own), or `null` if none exist yet. Resolves `null` rather than throwing — a hazardous event
  legitimately may have no spatial observation recorded yet.
- `findSpatialObservationByTime(hazardousEventId: string, observationTime: Date, tenantId: string): Promise<SpatialObservationRecord | null>`
  — exact-time lookup, needed by `3d`'s duplicate-`observationTime` conflict rule to check before
  insert.
- `saveSpatialObservation(hazardousEventId: string, observation: SpatialObservationRecord, tenantId: string): Promise<SpatialObservationRecord>`
  — insert-or-update for one observation.

**Why the spatial methods carry `tenantId` even though the real DB tables have no
`country_accounts_id` column of their own (they're only FK'd to `hazardous_event_id`):** this is
where this change directly addresses DEF-005 (spatial-footprint division linking has no tenant
check). `hazardousEventId` alone gives an implementation no tenant to scope by without first doing
a separate lookup; passing `tenantId` explicitly through the port means the future adapter _can_
verify the parent `hazardousEventId` actually belongs to `tenantId` before touching any spatial
row, closing the gap DEF-005 flags — structurally, at the port boundary, rather than trusting every
call site to remember it. The port only fixes the _shape_; the actual verification logic (does
`hazardousEventId` really belong to `tenantId`?) has no adapter to run in yet — that's explicitly
`3d`'s job, per proposal.md's register-bookkeeping note.

### 7. Concurrent-callers scenario: `findCurrentSpatialObservation` → `saveSpatialObservation` read-then-write pair

This spec's own mandatory rule (per the spec-writer's standing instructions) requires a
concurrent-callers scenario for any shared mutable state observable by two async callers before
the first resolves. This port has a real one: two callers each calling
`findCurrentSpatialObservation` (or checking via `findSpatialObservationByTime`), finding no
conflict, then both calling `saveSpatialObservation` for the same `hazardousEventId` +
`observationTime` concurrently. `hazardous_event_spatial_observation`'s own
`UNIQUE(hazardous_event_id, observation_time)` constraint (already shipped, see the table's own
comment: "DB-level defense-in-depth; the domain-layer conflict check (3d/5e) is authoritative") is
the actual mechanism that prevents two silently-conflicting rows from being created — not
something a zero-DB-dependency port definition can itself enforce. This change's own spec states
the expected outcome precisely (one call succeeds, the other's insert fails against the unique
index) and defers the actual conflict-handling contract (does the second caller get a thrown error?
a merged result? `3d`'s "explicit `confirmReplace` intent" rule?) to `3d`'s own design, exactly as
`3a`'s design.md deferred `IWorkflowRepository.save()`'s own lost-update race to its future adapter
proposal.

### 8. Attachments excluded entirely — neither the legacy jsonb column nor the new normalized table

`hazardousEventTable.attachments` (jsonb) is still actively read/written by
`processAndSaveAttachments` today and untouched until Phase 7's cutover (confirmed live, not dead
code). `hazardous_event_attachment` (the Phase 2 normalized table, `ca-he-attachment-schema`) is
additive and not yet consumed by any domain layer. The roadmap's port method list for `3b` names no
attachment method at all, so this change models neither — consistent with the "zero invented
methods" discipline `3a` established. A normalized-attachment domain concept, if warranted, is a
future change's design question.

### 9. `create()` validates Date validity for `createdAt`/`updatedAt`/`submittedAt` — closing a scope gap missed in the original proposal, mirroring `WorkflowInstance`'s own Decision 9

**The gap.** Decisions 2–4 above validate presence of `tenantId`/`specificHazardId`/`startDate`
and `startDate <= endDate` ordering, but nothing validated that `createdAt` (required `Date`),
`updatedAt` (`Date | null`), or `submittedAt` (`Date | null`) are actually valid `Date` instances.
Reproduced directly: `HazardousEvent.create({ ...validProps, createdAt: undefined })` throws a raw
`TypeError: Cannot read properties of undefined (reading 'getTime')` from inside the private
constructor's `cloneRequiredDate` helper — never reaching `ValidationError`. `new Date("garbage")`
is a second, subtler instance of the same gap: it passes an `instanceof Date` check but its
`getTime()` is `NaN`, so it would clone and store "successfully" while carrying no real instant. Both
are the exact class of bug `WorkflowInstance.ts`'s own design.md Decision 9 closed for its six
`Date`-typed fields (`createdAt`/`updatedAt` unconditionally, the four attribution `*At` fields only
when non-null).

**The fix.** `HazardousEvent.ts` gains a local `isInvalidDate(value: unknown): boolean` predicate,
identical to `WorkflowInstance.ts`'s own (`!(value instanceof Date) || Number.isNaN(value.getTime())`)
— deliberately typed `unknown`, not `Date`, so the `instanceof` disjunct can't later be "simplified
away" as unreachable by a reader who only sees the static `Date` type at each call site
(`WorkflowInstance.ts`'s own inline comment, carried over verbatim). `create()` now checks `createdAt`
unconditionally (required, never `null`), then `updatedAt` and `submittedAt` each only when non-null
(nullable, matching Decision 4's nullable-attribution reasoning), throwing `ValidationError`
referencing the field name — in that order, matching `WorkflowInstance.create()`'s own ordering of
its required fields before its nullable ones. This check runs **before** the existing
`startDate <= endDate` ordering check (Decision 3): an invalid Date must always be reported as a
Date-validity error, not misreported as a date-ordering error, the same reasoning `WorkflowInstance`'s
Decision 9 gives for running its own Date check before Decision 7's pair-consistency check.

**Not shared via import.** `isInvalidDate` is redefined locally in `HazardousEvent.ts` rather than
imported from `WorkflowInstance.ts` — importing across bounded contexts (`hazardous-events` ←
`validation-workflow`) would violate the same module-boundary discipline `IHazardousEventRepository`/
`IWorkflowRepository`'s own separation exists to enforce (Context, Decision 1). This matches how
`cloneDate`/`cloneRequiredDate` are already independently defined in both files rather than shared.

**Why this wasn't caught the first time.** The original roadmap/proposal task list (tasks.md
section 1) asked `create()` to "validate tenant, specificHazardId, and dates are present" — read,
correctly, as presence-of-required-string-fields (Decision 2's own gloss). Nothing in the original
scope asked for Date-_instance-validity_ on the three `Date`-typed props; `startDate`/`endDate` are
`string` columns and were never at risk of this bug. This is a scope gap in the original proposal,
not an implementation bug against a correct spec — the implementation faithfully matched what was
asked. The gap surfaced only after independently reproducing it and noticing `WorkflowInstance`
(`3a`) had already closed the identical gap for its own Date-typed fields, prompting the same check
here.

### 10. `create()` guards `tenantId`/`specificHazardId`/`startDate` with `typeof`, not just a null check — applying the sibling change's Gate 10 finding, not a new discovery in this file

**Provenance.** This is not an independently-discovered issue in `HazardousEvent.ts`. It was found
during Gate 10 (independent second-opinion review) of the sibling change
`ca-workflow-instance-entityid-validation`, against `WorkflowInstance.create()`'s own new `entityId`
check — see that change's design.md Decision 4. `HazardousEvent.create()`'s required-field loop
(Decision 2) uses the identical pattern: `value == null || value.trim().length === 0`. Both entities
share the same class of gap for the same reason (`HazardousEvent.create()` was the pattern
`WorkflowInstance.create()`'s `entityId` check was written to match — Context, above), so this
decision applies the sibling change's fix here for consistency between the two entities, in the
same round.

**The gap.** If a caller passes a non-string, non-null value for `tenantId`, `specificHazardId`, or
`startDate` (e.g. a number, from a future untyped adapter), `value == null` is `false` and
`value.trim()` throws a raw `TypeError` — never reaching `ValidationError`. This is the exact class
of bug this whole entity/validation effort exists to close: a domain entity must validate its own
invariants, never let malformed input escape as an unhandled exception.

**The fix.** Replace the loop body's check with `typeof value !== "string" || value.trim().length
=== 0` — a single condition that already covers `null`/`undefined`/number/object/etc. (none of which
satisfy `typeof value === "string"`) and the empty/whitespace-only case, without a separate null
check. `HazardousEventProps.tenantId`/`specificHazardId`/`startDate` are statically typed `string`,
so this only guards against a caller that bypasses TypeScript (an untyped adapter, JS caller, or bad
deserialization) — the same category the existing `== null` check already existed to guard against
(the loop's own comment: "an untyped adapter isn't bound by the `string` type"). This supersedes
Decision 2's literal check expression, not its reasoning: the loop stays a loop, still runs first in
`create()`, still throws `` `${field} must not be empty` `` — only the guard condition changes.

### 11. `create()` guards a present-but-non-string `endDate` before the ordering check — a different shape of fix than Decision 10, because `endDate` is optional

**Provenance.** Found by human review after round 3, on the same class of bug Decision 10 closed
for `tenantId`/`specificHazardId`/`startDate` — but in `endDate`'s own separate ordering-check code
path, which Decision 10's fix never touched. Round 3's own Gate 6 (16.6) and Gate 10 review already
flagged this exact gap ("endDate's ordering guard still lacks the typeof guard") and deliberately
left it out of round 3's scope; this decision is that flagged gap, closed.

**The gap.** The existing ordering check —

```ts
if (
	props.endDate != null &&
	props.endDate.trim().length > 0 &&
	props.startDate > props.endDate
) {
	throw new ValidationError("startDate must not be later than endDate");
}
```

— guards against `null`/`undefined` (`!= null`) but not against a non-`null` value that isn't a
string (e.g. a number from a future untyped adapter). `props.endDate != null` is `true` for a
number, so the guard falls through to `props.endDate.trim()`, which has no `.trim()` method and
throws a raw `TypeError` — never reaching `ValidationError`. This is the identical class of bug
Decision 10 closed for the three required fields, just reachable through `endDate`'s own,
separate `if` block instead of the required-field loop.

**Why this isn't Decision 10's fix verbatim.** Decision 10's three fields are required — they have
no valid `null`/`undefined` state, so `typeof value !== "string"` alone, applied unconditionally,
correctly rejects `null`/`undefined`/number/etc. as "must not be empty." `endDate` is different
(Decision 2): `null`/`undefined`/whitespace-only are valid, expected "not set" states that MUST NOT
throw. Applying `typeof props.endDate !== "string"` unconditionally would wrongly reject that valid
"not set" state. The guard must first exempt `null`/`undefined` (`props.endDate != null`) before
applying the `typeof` check, and — because a present-but-wrong-typed `endDate` and an
ordering failure are two semantically distinct problems — that exemption belongs in its **own**
`if` block, not folded into the ordering check's condition. Folding it in would either (a) silently
skip the ordering check for a non-string `endDate` (wrong: a malformed value should be rejected, not
quietly ignored) or (b) reuse the ordering check's `startDate must not be later than endDate`
message for a value that was never comparable in the first place (wrong: the reader has no way to
tell "these dates conflict" apart from "endDate isn't a string at all").

**The fix.** Add a type check immediately before the existing ordering check, as its own separate
`if` block:

```ts
if (props.endDate != null && typeof props.endDate !== "string") {
	throw new ValidationError("endDate must be a string");
}
if (
	props.endDate != null &&
	props.endDate.trim().length > 0 &&
	props.startDate > props.endDate
) {
	throw new ValidationError("startDate must not be later than endDate");
}
```

This keeps the two checks separate rather than combined into one boolean expression, matching this
file's own established per-concern-per-message style — the same style Decision 9 already uses for
`createdAt`/`updatedAt`/`submittedAt` (one `if` per field, each with its own message) — rather than
Decision 10's single-combined-condition loop style. Decision 10's single condition works there
specifically because all three of its fields share one message (`` `${field} must not be empty` ``)
and have no valid non-string state to protect; `endDate`'s two checks produce two distinct messages
for two distinct reasons, so they stay as two `if` blocks. The new check must run **before** the
ordering check — the ordering check's own `.trim()` call is exactly what would otherwise throw the
raw `TypeError` first.

**Scope.** This decision touches only `endDate`'s own ordering-check code path. It does not change
the required-field loop (Decision 10) or the Date-validity checks (Decision 9) — those already
guard correctly and are untouched.

## Risks / Trade-offs

- **`startDate`/`endDate` required only for `startDate` is a deliberate tightening, not a port of
  live behavior** (Decision 2) → today's `validate()` never requires either date unconditionally.
  Confirmed acceptable by the user 2026-09-16 given the roadmap's own ambiguous "dates are present"
  (plural) wording — a hazardous event with no start date at all is not a meaningful record.
- **`SpatialObservationRecord` is provisional and will need revisiting once `3d` ships** (Decision 5)
  → if `3d`'s real `SpatialObservation` entity shape differs from this placeholder (e.g. a
  richer geometry type once a spatial library is chosen), `IHazardousEventRepository`'s three
  spatial method signatures will need a follow-up change. Accepted — the alternative (blocking
  `3b` on `3d`, or building `3d`'s scope inside `3b`) is worse given Track A/B's own stated
  sequencing.
- **`IHazardousEventRepository`'s tenant parameter on spatial methods fixes the port shape but not
  the actual check** (Decision 6) → DEF-005 remains open until a real adapter implements the
  verification; this change cannot close it further without DB access, which would violate the
  Phase 3 zero-DB-dependency gate.
- **No lost-update protection on `save()` for concurrent edits to an existing row** (same class of
  risk `3a`'s design.md flagged for `IWorkflowRepository.save()`) → no persistence implementation
  exists yet for an optimistic-locking mechanism to live in; flagged for the future adapter
  proposal, not fixed here.

## Migration Plan

None. This change adds two new TypeScript files with no runtime side effects until a future use
case and repository adapter call them. No DB schema change, no data migration, no feature flag.

## Open Questions

None remaining for this change. Both questions raised during proposal review were resolved by the
user on 2026-09-16 and are folded into Decisions 2 and 4 above: `startDate` required/`endDate`
optional (Decision 2), and `submittedByUserId`/`submittedAt` kept as a pair (Decision 4).
