## Context

See proposal.md - Why for motivation. This covers only what shapes the four new collections'
design.

The sole source of truth for shape is six real, already-shipped Phase 2 tables, all read directly
during Phase 0 research (not re-derived from the roadmap text alone):

- `hazardDriverTable.ts` — tenant-scoped reference table (`id`, `name`, `countryAccountsId`
  `.notNull()`).
- `hazardousEventHazardDriverTable.ts` — join table (`hazardousEventId`/`hazardDriverId`, both FK
  `.notNull()` cascade, `UNIQUE(hazardousEventId, hazardDriverId)`).
- `hazardousEventAttachmentTable.ts` — direct one-to-many (`id`, `hazardousEventId` FK, `title`,
  `fileKey`, `fileName`, `fileType` all `text().notNull()`, `fileSize` `bigint(mode:number)
  .notNull()`). No uniqueness constraint beyond the PK.
- `hazardousEventFieldValueTable.ts` — (`hazardousEventId` FK, `hazardTypeFieldDefinitionId` FK,
  `value: text().notNull()`, `UNIQUE(hazardousEventId, hazardTypeFieldDefinitionId)`).
- `hazardousEventCustomFieldValueTable.ts` — same shape, FK to
  `hazardTypeCustomFieldDefinitionTable` instead, its own distinct
  `UNIQUE(hazardousEventId, hazardTypeCustomFieldDefinitionId)`.
- `hazardTypeFieldDefinitionTable.ts` (no `countryAccountsId` — global reference data) vs.
  `hazardTypeCustomFieldDefinitionTable.ts` (`countryAccountsId` `.notNull()` — tenant-scoped).
  This asymmetry is load-bearing for the Risks section below.

Existing precedent followed: `HazardousEvent.ts` itself (private constructor, single validated
`create()` factory, the `isInvalidDate`/`typeof` required-string-field guard pair) for the entity
shape, and `3d`'s archived design.md (`openspec/changes/archive/2026-09-22-ca-he-spatial-observation-entity/design.md`)
Decisions 3/4/8 for how a "collection with a DB-level uniqueness pair constraint" was reasoned
through last round — reused for the duplicate-value checks (Decision 3) and, per user direction
during review (2026-09-22), for the tenant-scoped membership check too (Decision 4), not assumed
identical to `3d` without checking which of the four collections it actually applies to.

`IHazardousEventRepository.ts` was also read: it declares no port method and no record type for
any of the three concerns this change adds. That confirms the roadmap's "no separate port at this
stage" framing is accurate today, not stale.

## Goals / Non-Goals

**Goals:**

- Add `hazardDriverIds`, `attachments`, `fieldValues`, `customFieldValues` to `HazardousEvent` as
  immutable, framework-free properties validated inside the existing `create()` factory.
- Mirror each table's own `UNIQUE` constraint with a domain-layer duplicate check (Invariant 3),
  for the three collections that have one (drivers, field values, custom field values — not
  attachments).
- Close the *shape* of `hazardDriverIds`/`customFieldValues`' cross-tenant reference gap by
  construction, in this same change, not deferred — see Decision 4.
- Zero DB/framework imports, verified by `yarn tsc` and the test tier itself (unit only, no
  PGlite import — Phase 3 Gate).

**Non-Goals:**

- No `IHazardousEventRepository` changes. No new port method, no new record type exported from
  the port file. A future persistence intent (this phase's `5e`-equivalent, not yet proposed)
  wires real adapters, the same division of labor `3d`'s design.md established for
  `SpatialObservation`.
- No membership/tenant-scoping validation for `attachments` or `fieldValues`. `attachments` has no
  FK to any tenant-scoped reference table at all — it is a direct child row, not a reference. Its
  actual data (title/fileKey/fileName/fileType/fileSize) is not a "belongs to a tenant" table.
  `fieldValues`'s FK target, `hazardTypeFieldDefinitionTable`, has no `countryAccountsId` — it is
  global reference data, so there is no cross-tenant question to close (verified directly by
  reading the table during this review round, not assumed). `hazardDriverIds` and
  `customFieldValues` are **not** exempt — see Decision 4; the earlier draft of this design
  incorrectly grouped all four collections together on this point, corrected here.
- No per-value-shape validation of `value` (e.g. type-checking against the referenced
  `fieldDataTypeTable`/`unit` — that would require a live DB read this entity cannot perform).
  `value` is validated only as "a string," matching `HazardousEvent.ts`'s own treatment of
  free-text columns like `description`/`magnitude` (never validated beyond their declared type).
- No positivity check on `fileSize`. The DB column has no `CHECK` constraint enforcing it; adding
  one here would be an invented business rule, not a mirrored DB constraint (see Decision 5).
- No real tenant-scoped query inside `create()` for either new valid-id set — `create()` receives
  `validHazardDriverIds`/`validCustomFieldDefinitionIds` as plain parameters; computing them
  correctly (a real, tenant-filtered query against `hazardDriverTable`/
  `hazardTypeCustomFieldDefinitionTable`) is the eventual persistence intent's job, the same
  division of labor `3d`'s Non-Goals established for `validDivisionIds` and `5e`.
- No deep-clone of collection elements. The defensive-copy guarantee (spec: "not the live internal
  array") is array-level only, matching the spec scenario's own wording ("pushes an element, or
  mutates the original array") — `attachments`/`fieldValues`/`customFieldValues` element objects
  are not individually frozen or cloned (Gate 10 finding).
- No max-length or max-cardinality validation on any string field or collection. No backing table
  declares a `CHECK` constraint or array-size limit to mirror (same reasoning as Decision 5's
  `fileSize` positivity — Invariant 3 mirrors real DB constraints, it does not invent new ones).

## Decisions

### 1. Four new required (not optional) properties on `HazardousEventProps`

`hazardDriverIds: readonly string[]`, `attachments: readonly HazardousEventAttachmentProps[]`,
`fieldValues: readonly HazardousEventFieldValueProps[]`,
`customFieldValues: readonly HazardousEventCustomFieldValueProps[]` — all required, an empty
array being the normal "no drivers/attachments/field values yet" state, not an omitted property.

**Alternative considered:** make them optional with an implicit `[]` default inside `create()`.
Rejected — every existing property on `HazardousEventProps` is required (`string`, `Date`, or
`| null`, never `?:`). Introducing the first optional property here would create a two-tier
convention on the same interface, and it would let a future adapter hydrating a row silently omit
a collection instead of the type system catching the gap at compile time. The cost is real and
already found during Phase 0: `IHazardousEventRepository.test.ts`'s `baseHazardousEventProps`
fixture must be updated to supply all four (see proposal.md Impact) — accepted deliberately, not
a side effect to work around.

### 2. `attachments` gets a validated-but-unchecked `id`; `fieldValues`/`customFieldValues` use their FK as the natural discriminator, no synthetic `id`

`HazardousEventAttachmentProps` includes `id: string`, matching the DB row's real PK — an
attachment has no other field guaranteed unique within the collection (no `UNIQUE` constraint
exists on the table beyond the PK), so without `id` two attachments could never be told apart.
Following `HazardousEvent.ts`'s own existing convention exactly: `id` is typed on
`HazardousEventProps` but never included in the required-string-field validation loop (only
`tenantId`/`specificHazardId`/`startDate` are checked there, `create()` lines 73-83). The same
treatment applies here — `attachments[].id` is typed `string`, not validated for presence,
because `ourRandomUUID()` is a DB-side default a caller constructing a not-yet-persisted
attachment cannot be expected to supply.

`HazardousEventFieldValueProps`/`HazardousEventCustomFieldValueProps` carry no `id` field at all.
Their real DB row does have its own PK, but the *validated, meaningful* discriminator within the
collection is the FK itself (`hazardTypeFieldDefinitionId`/`hazardTypeCustomFieldDefinitionId`) —
the table's own `UNIQUE(hazardousEventId, <FK>)` constraint makes the FK the natural key within
one event's collection, the same role `divisionId` played for `SpatialObservation`'s
`divisionIds` in `3d` (a bare array of the natural key, no synthetic wrapper).

### 3. Duplicate-value checks mirror each table's `UNIQUE` constraint — reusing `3d`'s Set-based pattern, not its membership check

Per Invariant 3, three of the four collections get a domain-layer duplicate check identical in
shape to `SpatialObservation.ts`'s Decision 3 (`new Set(values).size !== values.length`, checked
only after an `Array.isArray` guard has already run — Decision 6 below):

- `hazardDriverIds` — deduplicated on the id itself, mirroring
  `UNIQUE(hazardousEventId, hazardDriverId)`.
- `fieldValues` — deduplicated on `hazardTypeFieldDefinitionId`, mirroring
  `UNIQUE(hazardousEventId, hazardTypeFieldDefinitionId)`.
- `customFieldValues` — deduplicated on `hazardTypeCustomFieldDefinitionId`, mirroring its own
  distinct `UNIQUE(hazardousEventId, hazardTypeCustomFieldDefinitionId)` constraint. Kept as a
  fully separate check against a fully separate array — not merged with `fieldValues`'s check —
  because the two source tables and their FK targets are genuinely distinct (proposal.md What
  Changes).

`attachments` gets no duplicate-value check: the table has no `UNIQUE` constraint beyond its PK,
so there is no DB-level rule to mirror, and inventing a "no two attachments with the same title"
rule would be an unrequested business rule, not a mirrored one.

### 4. `create()` validates `hazardDriverIds` and `customFieldValues` against caller-supplied tenant-scoped sets — closes `DEF-021`'s shape by construction, reusing `3d`'s `validDivisionIds` pattern exactly

`hazardDriverTable.countryAccountsId` and `hazardTypeCustomFieldDefinitionTable.countryAccountsId`
are both `.notNull()`, but neither `hazardousEventHazardDriverTable` nor
`hazardousEventCustomFieldValueTable` enforces that the referenced driver/definition belongs to
the same tenant as the `hazardous_event` row — the same class of gap `DEF-005` named for
divisions. Closed the same way `3d` closed `DEF-005`, not deferred: `create()` gains two mandatory
parameters, `validHazardDriverIds: ReadonlySet<string>` and
`validCustomFieldDefinitionIds: ReadonlySet<string>` (no default, matching
`SpatialObservation.create()`'s `validDivisionIds`). Every `hazardDriverIds` entry and every
`customFieldValues[].hazardTypeCustomFieldDefinitionId` must be present in its respective set or
`create()` throws `ValidationError` naming the offending id; an empty collection needs no
membership check. The check runs last within each collection — after the array-shape guard and
duplicate-value check (Decision 6) — since a malformed or duplicate id is a shape problem
independent of which ids are "valid."

Safe because `HazardousEvent.create()` has zero real (non-test) callers anywhere in the codebase
(grepped `app/`/`tests/`) — only `HazardousEvent.test.ts` and
`IHazardousEventRepository.test.ts`'s fixture call it, both already touched by this change
(tasks.md Sections 1, 4, 6) — so the signature change is fully expand-only in practice.

This closes the gap's **shape, not its substance**: `create()` still has zero DB access and cannot
verify a caller computed either set with a real tenant filter — that real query is the eventual
persistence intent's job (Non-Goals). The residual gap stays tracked as a narrowed `DEF-021` entry
in the register, edited rather than deleted, matching how `DEF-005` itself reads today after `3d`.

`fieldValues` and `attachments` are exempt, not merely omitted: `hazardTypeFieldDefinitionTable`
(the `fieldValues` FK target) has no `countryAccountsId` — global reference data, no tenant to
check against — and `attachments` has no FK to any reference table at all. Extending the
mandatory-set treatment to either would invent a check with nothing behind it.

### 5. `fileSize` validated as shape (`typeof === "number"`, finite, integer), not business rule (no positivity check)

`bigint("file_size", { mode: "number" }).notNull()` tells the domain layer two things: the value
must be present, and Drizzle's `mode: "number"` contract is a JS `number`. `create()` therefore
checks `typeof === "number" && Number.isFinite(value) && Number.isInteger(value)`, throwing
`ValidationError` naming `fileSize` otherwise — the same "never let a malformed value reach a raw
runtime error or a silently-wrong copy" principle `HazardousEvent.ts`'s Decision 10 established
for string fields, extended here to a numeric field for the first time in this entity family. No
`> 0` check is added: the table carries no `CHECK` constraint enforcing positivity, and Invariant
3 is about mirroring a real DB constraint, not inventing a new one the schema itself doesn't
express.

### 6. Validation ordering: existing checks unchanged and run first; the four new collections validated after, each array-shape-guarded before its own per-item, duplicate, and (where applicable) membership checks

The existing `create()` body (required-field loop, date-validity guards, date-ordering check,
attribution normalization) is untouched and keeps its current priority — no existing
`HazardousEvent.test.ts` assertion about error priority changes. The four new collections are
then validated in the order proposal.md lists them (drivers → attachments → field values →
custom field values), and within each collection: `Array.isArray` first (matching `3d`'s Decision
8 ordering rationale — a non-array value must never reach a per-item loop or a `Set`-based
duplicate check, where it could silently iterate as characters or throw a raw `TypeError`), then
per-item shape checks, then the duplicate-value check where one applies (Decision 3), then —
for `hazardDriverIds` and `customFieldValues` only — the membership check against the
caller-supplied valid-id set (Decision 4). This order is arbitrary between the four collections
themselves (they are unrelated, per proposal.md's own framing) but fixed and documented so tests
have an unambiguous target, the same discipline `3d` Decision 8 applied, and the shape-before-
duplicate-before-membership ordering within a collection matches `3d`'s own precedent exactly.

**Addendum (Gate 8 finding):** the array-level `Array.isArray` guard above stops a non-array
collection from reaching the per-item loop, but it does not stop a malformed *element* within an
otherwise-array collection — `attachments: [null]` or `fieldValues: ["garbage"]` still reach
`attachment.title`/`fieldValue.hazardTypeFieldDefinitionId` and throw a raw, uncaught `TypeError`,
not `ValidationError`. This is the same class of bug Decision 10 already treats as a hard rule for
string fields (never let a malformed value reach a raw runtime error), applied one level deeper
than the existing array-level guard already applies it. `validateAttachments`/`validateFieldValues`/
`validateCustomFieldValues` therefore each guard that the element itself is a plain, non-null
object (`typeof element === "object" && element !== null`) before any property access on it,
throwing `ValidationError` referencing the collection name otherwise — run immediately after the
array-shape guard and before any per-field check. `hazardDriverIds` needs no equivalent guard: its
elements are required to be plain strings, and `assertNonEmptyString`'s own
`typeof value !== "string"` check already handles a non-string element — including `null`,
`undefined`, or an object — safely, without ever dereferencing a property on it.

### 7. `ValidationError`, not `ConflictError` or `NotFoundError`, for every new check

Confirmed against `app/shared/errors/DomainError.ts` directly (not assumed): `ValidationError`
(422) is for malformed/incomplete input; `ConflictError` (409) is "well-formed input, disallowed
given existing state" (`WorkflowInstance.transition()`'s own use, reaffirmed by `3d`'s Decision
6); `NotFoundError` (404) requires an entity/id pair looked up and absent. None of the four new
collections' checks — including the two new membership checks (Decision 4) — depend on any state
outside the `props` object and the caller-supplied valid-id sets passed to `create()`; a duplicate
driver id, a non-array `attachments`, a non-numeric `fileSize`, or a driver id absent from
`validHazardDriverIds` are all shape/reference problems knowable at construction time, matching
the roadmap's own framing ("none carries a business rule beyond basic shape validation") and `3d`'s
own choice of `ValidationError`, not `ConflictError`, for its analogous `validDivisionIds` check.
`ValidationError` is used throughout, with no exception.

## Risks / Trade-offs

- **[Risk] `IHazardousEventRepository.test.ts`'s fixture must be updated for this change to
  compile**, a roadmap-list deviation found during Phase 0 (proposal.md Impact). → Mitigation:
  included explicitly in tasks.md as its own task and its own verification command, not folded
  silently into the `HazardousEvent.test.ts` task.
- **[Risk] `validHazardDriverIds`/`validCustomFieldDefinitionIds` close the gap's shape, not its
  substance** (Decision 4) — a future adapter could still compute either set without a tenant
  filter and `create()` has no way to detect that. → Mitigation: tracked as the narrowed `DEF-021`
  register entry; verifying the real query is the eventual persistence intent's job (PGlite tier).
- **[Risk] Mandatory concurrent-callers scenario does not apply here, stated explicitly rather
  than silently omitted.** `HazardousEvent.create()` is a synchronous, pure factory with no
  shared mutable state — the same reasoning `3d`'s design.md Decision 7 gave for
  `SpatialObservation.ts` itself ("holds no shared mutable state... a pure entity/pure static
  functions have no internal cache/counter for two callers to race on"). The real race — two
  concurrent callers both attaching the same driver, or the same field-value definition, to one
  event before either write lands — is a persistence-layer concern this change has no adapter to
  host yet. The three `UNIQUE` constraints (driver-pair, field-value-pair, custom-field-value-pair)
  are what will actually resolve that race once a real adapter exists, the same DB-level
  backstop `3d`'s spatial-observation `UNIQUE(hazardous_event_id, observation_time)` constraint
  provides today. → Mitigation: none needed now; flagged so the eventual persistence intent
  inherits this contract explicitly rather than rediscovering it, matching `3d`'s own hand-off
  pattern for its Decision 7.
- **[Risk] `attachments[].id` is typed but unvalidated, matching `HazardousEvent.ts`'s own `id`
  precedent — a caller could pass a blank or malformed `id` and `create()` would not reject
  it.** → Mitigation: accepted deliberately (Decision 2), not overlooked — the existing entity's
  own `id` field has the identical gap today, and closing it here without also closing it for
  `HazardousEvent.id` itself would be an inconsistent, unrequested tightening outside this
  change's scope.

## Migration Plan

None. This change adds four properties and three exported types to one existing TypeScript file
(plus its test, plus one downstream fixture), with no runtime side effects until a future
persistence intent (not yet proposed) constructs a `HazardousEvent` with real values for these
collections. No DB schema change, no data migration, no feature flag.
