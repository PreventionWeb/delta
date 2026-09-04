## Context

Today's `hipHazardTable`/`hipClusterTable`/`hipTypeTable` (`app/drizzle/schema/`) use
text/code primary keys, a flat 3-level chain, no version concept, and are read by 34
files. The target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`,
"HIPs Management" swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-60..103`) replaces this with a
uuid-keyed 4-level chain. Verified field-by-field against the raw XML per the roadmap's
`2a` lesson (paraphrased summaries have previously dropped/added fields).

`2a` (`app/domains/validation-workflow/infrastructure/workflowInstanceTable.ts`, merged)
set the current repo convention for a hand-authored migration + check-constraint schema
and is the pattern this intent follows.

## Goals / Non-Goals

**Goals:** the 4 new tables, correctly chained by FK, migrated via a hand-authored SQL
file, testable in PGlite.

**Non-Goals:** touching `hip_hazard`/`hip_cluster`/`hip_class` or any of their 34
consumers; touching `hazardous_event` (`2i`); wiring these tables into any route, model,
or `fieldsDef` (no presentation-layer impact — pure schema).

## Decisions

**1. Exact field list per table (from the `.drawio`, not the roadmap prose):**

| Table             | Columns (diagram order)                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `specific_hazard` | `id` (uuid, PK), `name` (text, NN), `code` (text, NN), `hazard_cluster_id` (FK → `hazard_cluster.id`) |
| `hazard_cluster`  | `id` (uuid, PK), `name` (text, NN), `hazard_type_id` (FK → `hazard_type.id`)                          |
| `hazard_type`     | `id` (uuid, PK), `name` (text, NN), `hip_version_id`\* (FK → `hips_version.id`)                       |
| `hips_version`    | `id` (uuid, PK), `version_no` (type undeclared\*\*)                                                   |

No table carries `country_accounts_id` or timestamps — absent in the diagram for all 4,
matching today's `hip_hazard`/`hip_cluster`/`hip_class` (also timestamp-less global
reference data). Treated as deliberate, not an omission.

**2. \*FK column naming — confirmed by user.** The diagram literally labels `hazard_type`'s
FK column `hip_version_id`, not `hips_version_id`, inconsistent with the target table's own
name (`hips_version`). Treated as a diagram typo (same class as `2a`'s
`hip_veresion_id` fix): named `hipsVersionId` / `hips_version_id` for internal consistency
— every other FK in this chain is `<referenced_table>_id`.

**3. \*\*`hips_version.version_no` type — confirmed by user.** Every other field in this
section states its type inline (`(uuid)`, `(text)`); `version_no` does not. Roadmap text
(line 409) references "a HIPs-2025-document" — version labels read as document-year-based
(e.g. `"HIPs 2025"`), not a sequential integer. Declared as `text`.

**4. FK nullability — not marked in the diagram, decided by precedent.** The diagram's
NN/FK badges are mutually exclusive on every row in the whole file (verified: no row
carries both), so absence of "NN" on an FK row is not evidence of nullability either way.
Decision: all three chain FKs (`specific_hazard.hazard_cluster_id`,
`hazard_cluster.hazard_type_id`, `hazard_type.hips_version_id`) are `NOT NULL` — matches
today's `hipHazardTable.clusterId`/`hipClusterTable.typeId` (both `notNull()`), and a
nullable link would let a row exist outside the hierarchy the chain exists to enforce.

**5. No `onDelete` cascade on any chain FK** — default `RESTRICT`, matching today's
`hipHazardTable`/`hipClusterTable` (neither sets `onDelete`). Reference data: deleting a
`hazard_type` should not silently cascade-delete every `hazard_cluster`/`specific_hazard`
under it.

**6. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new
entry in `app/drizzle/migrations/meta/_journal.json` — `2a`'s convention
(`20260902120000_add_workflow_tables.sql`). Uses `text({ enum: [...] })`/`check()` only
where an enum exists; none of these 4 tables has one.

**7. Schema location: `app/domains/hazardous-events/infrastructure/`, not
`app/drizzle/schema/` — corrected after implementation, per ADR-009.** Originally placed in
the shared `app/drizzle/schema/` folder, justified at the time by "matches Notices' and
Track B's existing convention." That justification was wrong: it cited the legacy,
pre-CA folder layout as if it were a considered CA decision, without checking it against
ADR-009 (context-first, layers nested inside each bounded context; `infrastructure/` is one
of those nested layers). `app/drizzle/schema/` is not one of ADR-009's named cross-cutting
exceptions (`app/infrastructure/`, `app/shared/`) — it's simply where Drizzle files have
always lived, which this migration exists to move away from, not extend.

Checked before finalizing: whether HIP hierarchy data is HE-exclusive. It isn't —
`disasterEventTable.ts`, `disasterRecordsTable.ts`, and several analytics models also
consume today's `hipHazardTable`/`hipClusterTable`/`hipTypeTable`. This mirrors exactly why
`workflow_instance` became its own sibling bounded context (`validation-workflow`) rather
than living inside HE. **User's explicit call, given no CA domain but HE exists yet and no
real domain behavior (validation/versioning) exists on this data today:** keep it in HE's
own `infrastructure/` for now, as the simplest option; move whatever is genuinely shared
into `app/shared/`/`app/infrastructure/` (or its own sibling bounded context, if it grows
real behavior) once Disaster Events' own CA migration starts. Documented here so that
future work has the reasoning, not just the placement.

**8. Test schema barrel — re-export, not duplicate.** `tests/integration/db/testSchema/`
has two existing patterns: `hipClusterTable.ts` (hand-duplicated schema) and
`workflowInstanceTable.ts` (`export * from "~/domains/.../workflowInstanceTable"`). `2a`
set the re-export pattern; this intent follows it (`export * from
"~/domains/hazardous-events/infrastructure/specificHazardTable"` etc.) to avoid drift
between the real and test schema.

## Risks / Trade-offs

- [Diagram gaps 2 & 3 above are guesses, not certainties] → explicitly flagged, both
  cheap to correct pre-`yarn dbsync` since this is a new migration with no prod data yet.
- [FK `NOT NULL` (Decision 4) could be wrong if the diagram intends partial/staged data
  entry] → matches existing precedent; low risk, easy to loosen later since nothing
  writes to these tables yet.

## Migration Plan

Additive only — `CREATE TABLE IF NOT EXISTS` × 4, no existing table touched, no rollback
data-loss risk. `yarn dbsync` applies; a straight `DROP TABLE` migration would fully
revert if needed (nothing references these tables yet).
