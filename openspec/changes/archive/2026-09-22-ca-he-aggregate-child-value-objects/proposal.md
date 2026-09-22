## Why

`HazardousEvent` (`app/domains/hazardous-events/domain/HazardousEvent.ts`) models the aggregate's
own core columns but has no domain-layer representation of three real, already-shipped Phase 2
child concerns: hazard drivers, attachments, and hazard-type field values. Each has a real table
with real `NOT NULL`/`UNIQUE` constraints today, but nothing in the domain layer enforces those
constraints before a future persistence adapter is written — a violation of Invariant 3 (DB
constraints are defense-in-depth, never a substitute for the domain-layer rule). This is the last
of the five Phase 3 Track B intents (`3a`-`3e`) that complete the `HazardousEvent` aggregate before
Phase 4 use cases and Phase 5 persistence begin.

## What Changes

- Add four new `readonly` properties to `HazardousEventProps`/`HazardousEvent`, each validated
  inside the existing `HazardousEvent.create()` factory (no new factory, no extracted class):
  - `hazardDriverIds: readonly string[]` — mirrors `hazardous_event_hazard_driver`'s join row,
    modeled as a bare id collection (same pattern `SpatialObservation.ts`'s `divisionIds`
    established in `3d`), duplicate-checked against the table's own
    `UNIQUE(hazardousEventId, hazardDriverId)` constraint, and validated against a mandatory,
    caller-supplied `validHazardDriverIds: ReadonlySet<string>` parameter (see below).
  - `attachments: readonly HazardousEventAttachmentProps[]` — one value object per
    `hazardous_event_attachment` row (`id`, `title`, `fileKey`, `fileName`, `fileType`,
    `fileSize`). No duplicate-check — the table carries no uniqueness constraint beyond its PK.
  - `fieldValues: readonly HazardousEventFieldValueProps[]` — one value object per
    `hazardous_event_field_value` row (`hazardTypeFieldDefinitionId`, `value`), duplicate-checked
    against `UNIQUE(hazardousEventId, hazardTypeFieldDefinitionId)`.
  - `customFieldValues: readonly HazardousEventCustomFieldValueProps[]` — same shape as
    `fieldValues`, FK to `hazard_type_custom_field_definition` instead, duplicate-checked against
    its own, distinct `UNIQUE(hazardousEventId, hazardTypeCustomFieldDefinitionId)` constraint,
    and validated against a mandatory, caller-supplied
    `validCustomFieldDefinitionIds: ReadonlySet<string>` parameter (see below). Modeled as a
    genuinely separate collection, not merged with `fieldValues` — the two source tables are
    distinct with distinct FK targets (roadmap 2h's own resolved decision).
- Validation is shape-only for `attachments` and `fieldValues`, per the roadmap's own scoping:
  array-ness, required-field presence (typed and non-empty where the underlying DB column is a
  required identity/FK field), and the duplicate-value checks above.
- **`HazardousEvent.create()` gains two new mandatory parameters,
  `validHazardDriverIds: ReadonlySet<string>` and
  `validCustomFieldDefinitionIds: ReadonlySet<string>`, closing `DEF-021` (a cross-tenant
  reference gap found during this change's own Phase 0 research) by construction, in this same
  change, not deferred.** `hazard_driver` and `hazard_type_custom_field_definition` are both
  tenant-scoped tables (`countryAccountsId NOT NULL`), but neither
  `hazardous_event_hazard_driver` nor `hazardous_event_custom_field_value` enforces same-tenant
  membership today. `create()` now requires the caller to supply the tenant-scoped set of valid
  ids for each and throws `ValidationError` for any referenced id absent from it — reusing `3d`'s
  `validDivisionIds` pattern exactly (see design.md Decision 4). This was corrected during review:
  the first draft of this proposal deferred the gap to a register entry; the user directed closing
  it here instead, per the project's "don't get into debt" precedent, and a blast-radius check
  confirmed `HazardousEvent.create()` has zero real (non-test) callers today, so the signature
  change costs nothing downstream. `fieldValues` and `attachments` get no equivalent parameter —
  `hazardTypeFieldDefinitionTable` (the `fieldValues` FK target) has no `countryAccountsId` at all
  (global reference data), and `attachments` has no FK to any tenant-scoped table.
- No new port method, no new repository, no new file — this stays entity-internal, matching the
  roadmap's explicit framing ("unlike causality or spatial observations above"). The two new
  `validHazardDriverIds`/`validCustomFieldDefinitionIds` sets are plain parameters, not a live DB
  read — computing them correctly (a real, tenant-filtered query) remains a future persistence
  intent's job, the identical division of labor `3d` established for `validDivisionIds`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hazardous-event-entity`: `HazardousEvent.create()` gains validation for four new child
  collections (hazard drivers, attachments, standard field values, custom field values), two
  mandatory tenant-scoped membership parameters (`validHazardDriverIds`,
  `validCustomFieldDefinitionIds`) closing `DEF-021` by construction, and the entity's "exposes
  all retained columns read-only" requirement is restated to include the four new properties.

## Impact

- **Files changed:**
  - `app/domains/hazardous-events/domain/HazardousEvent.ts` — add `HazardousEventAttachmentProps`,
    `HazardousEventFieldValueProps`, `HazardousEventCustomFieldValueProps` types; add four new
    props to `HazardousEventProps`; add their validation to `create()`, including two new
    mandatory `create()` parameters (`validHazardDriverIds`, `validCustomFieldDefinitionIds`);
    add four new getters. `create()`'s signature change is confirmed expand-only in practice —
    grepped `app/` and `tests/` for real callers: none exist outside this change's own test files.
  - `app/domains/hazardous-events/domain/HazardousEvent.test.ts` — new scenarios for each
    collection's shape validation and duplicate-value rejection.
  - `app/domains/hazardous-events/application/ports/IHazardousEventRepository.test.ts` —
    **roadmap deviation, found during Phase 0 research, not listed in the roadmap's own
    files-touched list.** This file's `baseHazardousEventProps` fixture (line 13) constructs a
    real `HazardousEventProps` object via `HazardousEvent.create()`. Since the four new
    properties are required (not optional — see design.md for why), this fixture will fail
    `yarn tsc` unless it supplies them. Grepped `tests/` for the same risk: no match: no PGlite
    fixture outside this one file constructs `HazardousEventProps`.
- **No DB migration.** All six backing tables (`hazardDriverTable`,
  `hazardousEventHazardDriverTable`, `hazardousEventAttachmentTable`,
  `hazardousEventFieldValueTable`, `hazardousEventCustomFieldValueTable`, and the two hazard-type
  field-definition tables referenced by FK) already shipped in Phase 2. This change adds no
  columns and no tables.
- **Test approach:** unit only (Vitest), zero DB/PGlite dependency — matches the Phase 3 Gate
  ("every entity/service above has zero DB and zero NestJS/framework dependency"). No
  `tests/integration/db/` files are touched or added.
- **Multi-tenancy / security note:** `hazard_driver` and `hazard_type_custom_field_definition` are
  both tenant-owned, but nothing today enforces that a referenced driver/custom-field-definition
  belongs to the same tenant as its `hazardous_event` — the same class of gap `DEF-005` named for
  divisions, not covered by any existing register entry. `HazardousEvent.create()` now closes this
  gap's *shape* by construction (mandatory `validHazardDriverIds`/`validCustomFieldDefinitionIds`
  sets, rejecting any id absent from them), the same pattern `3d` used for `DEF-005` — see
  design.md Decision 4 for the full mechanism and why `fieldValues`/`attachments` are exempt. The
  residual substance-level gap (verifying a future adapter computes those sets tenant-correctly)
  stays tracked as a narrowed `DEF-021` register entry, not deleted, matching `DEF-005`'s own
  treatment.
