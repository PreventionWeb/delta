## Context

Target ER diagram (`tmp/hazardous-events-er-diagram/hazardous-events.drawio`, "hazardous event
causality" swimlane, cells `KqZPbQY2Lv0Ew4p42Cft-224..275`) introduces `hazardous_event_causality`.
Verified field-by-field against the raw XML per the roadmap's `2a` lesson — the PNG render at
`_docs/refactoring-plan/diagrams/hazardous-events-er-diagram.png` has produced misreadings before
and is not used here.

Two existing precedents compete for this table's shape:

- `app/drizzle/schema/eventRelationshipTable.ts` — the table this intent replaces for HE's own
  causal chain. `parentId`/`childId`, not-null, but **no cascade, no index**.
- `app/drizzle/schema/eventCausalityTable.ts` — DE-side causality linking (untouched by this
  intent, see Non-Goals). Not-null, **cascade on every FK, indexed on every FK**, `defaultNow()`
  timestamps, uses `check()` from `drizzle-orm/pg-core` for its own type-consistency constraints.

User confirmed: follow `eventCausalityTable`'s pattern, not `eventRelationshipTable`'s — it's the
more directly relevant and more complete precedent for "causality" specifically.

`2d` (`hazardDriverTable.ts`/`hazardousEventHazardDriverTable.ts`, merged) is the direct precedent
for this intent's hand-authored-migration and `infrastructure/` placement conventions.

## Goals / Non-Goals

**Goals:** the `hazardous_event_causality` table, migrated via a hand-authored SQL file, testable
in PGlite.

**Non-Goals:** absorbing or modifying `eventCausalityTable` (DE-side linking stays untouched, per
roadmap Non-Goals); wiring the table into any route, model, or `fieldsDef` (pure schema); any
domain-layer cycle-detection logic (that's `3c`, app-layer, per resolved open decision #7 — this
intent adds only the DB-level trivial-case CHECK described in Decision 3).

## Decisions

**1. Exact field list (from the `.drawio`, not the roadmap prose):**

| Column                      | Type / constraint                           |
| --------------------------- | ------------------------------------------- |
| `id`                        | uuid, PK, `gen_random_uuid()`-style default |
| `cause_hazardous_event_id`  | uuid, FK → `hazardous_event.id`             |
| `effect_hazardous_event_id` | uuid, FK → `hazardous_event.id`             |
| `causality_explanation`     | text, nullable                              |
| `created_at`                | timestamptz, diagram shows `DEFAULT now()`  |
| `updated_at`                | timestamptz, no default shown in diagram    |

The diagram's "FK" badge and "not null" badge never co-occur on the same row anywhere in this
document's tables (confirmed across `2a`-`2d`) — their absence on `effect_hazardous_event_id`'s
row is not evidence it isn't a not-null FK; an edge connector from `hazardous_event` confirms it
is one.

**2. `createdAt`/`updatedAt` — inline `timestamp(..., { withTimezone: true })`, both
`.notNull().default(sql\`CURRENT_TIMESTAMP\`)`.** Per ADR-002, no `createdUpdatedTimestamps`
helper — matches `hazardDriverTable.ts`/`hazardousEventHazardDriverTable.ts`'s (`2d`) established
pattern. Applied symmetrically to `updated_at` even though the diagram only annotates a default on
`created_at` — same treatment as `2d`'s tables, where the diagram showed no default on either
column and the convention was still applied uniformly. An asymmetric default (one column defaulted,
the other not) would be an unexplained special case with no functional benefit.

**3. Both FKs `.notNull().references(() => hazardousEventTable.id, { onDelete: "cascade" })`,
each individually `index()`-ed — follows `eventCausalityTable`, not `eventRelationshipTable`.**
User's explicit choice (see Context) between the two competing precedents in this codebase.
Without cascade, deleting a `hazardous_event` referenced by a causality row would raise an FK
violation instead of cleanly removing the link; without indexes, a cascade delete against either
parent would seq-scan this table. Index names, matching `2d`'s
`hazardous_event_hazard_driver_event_id_idx` convention:
`hazardous_event_causality_cause_id_idx` (on `cause_hazardous_event_id`) and
`hazardous_event_causality_effect_id_idx` (on `effect_hazardous_event_id`).

**4. `CHECK(cause_hazardous_event_id <> effect_hazardous_event_id)` — the DB-level half of
Invariant 3.** Per the roadmap's own **Invariant 3** ("DB constraints are defense-in-depth, not a
substitute for domain-layer rules" — added just above Non-goals, right after Invariant 2): "A rule
that's cheap to express in static SQL... is worth adding at the DB level as a safety net — but it
never satisfies the rule on its own... the authoritative home for a business invariant is always
the domain layer." This CHECK is the DB-level "belt" for the trivial 1-length degenerate case (an
event causing itself); the "suspenders" — the domain-layer check, with its own meaningful domain
error, plus the general n-length cycle case — is `3c`'s job, per the roadmap's resolved open
decision #7. Implemented with `check()` from `drizzle-orm/pg-core`, matching
`eventCausalityTable.ts`'s own `check()` usage in this same file for its type-consistency
constraints. Constraint name, matching `eventCausalityTable`'s
`event_causality_triggering_entity_fk_check` naming convention:
`hazardous_event_causality_cause_effect_distinct_check`.

**5. No general cycle-prevention CHECK constraint beyond Decision 4's trivial case.** Matches the
roadmap's own already-resolved open decision #7 — full n-length cycle detection stays app-layer
(`3c`), not re-opened here.

**6. Schema location: `app/domains/hazardous-events/infrastructure/`, not
`app/drizzle/schema/` — per ADR-009.** Every new Track B table lives in HE's own
`infrastructure/` for now — same reasoning as `2b`/`2c`/`2d` (see `2b`'s archived design.md
Decision 7, `2d`'s Decision 4). Not added to `app/drizzle/schema/index.ts`; only the PGlite
`testSchema` barrel gets an entry.

**7. HE-exclusive — no extraction flag, same treatment as `2d`.** The roadmap's own text confirms
DE's `eventCausalityTable` stays untouched and separate — no absorption (Non-Goals). This is a
permanent HE-owned addition, not a reconciliation against shared data.

**8. Both FKs reach into the legacy `app/drizzle/schema/hazardousEventTable.ts` — same category of
exception as `2d`'s Decision 6, but broader.** `2d` had exactly one cross-package FK
(`hazardousEventHazardDriverTable.hazardousEventId`); this table has **two** — both
`cause_hazardous_event_id` and `effect_hazardous_event_id` point at the same still-legacy
`hazardousEventTable`. This is a necessary, narrow exception (the table being causally linked
hasn't been CA-migrated yet), not a precedent for routinely reaching into `app/drizzle/schema/`
from `infrastructure/`. `hazardousEventTable` is already present in the test schema barrel
(`tests/integration/db/testSchema/hazardousEventTable.ts`), so no new barrel entry is needed for
the FK target itself.

**9. Migration is hand-authored SQL** (not `drizzle-kit generate`), registered as a new entry in
`app/drizzle/migrations/meta/_journal.json` — `2a`-`2d`'s convention. **This migration has three
top-level statements, not one**: the `CREATE TABLE IF NOT EXISTS` (with the CHECK constraint
inline — Postgres supports that in the table definition), followed by two separate `CREATE INDEX`
statements for Decision 3's per-FK indexes — Postgres has no inline syntax for a plain
(non-unique) index inside `CREATE TABLE`, unlike a `UNIQUE` or `PRIMARY KEY` constraint. Each of
the three statements MUST be separated by its own `--> statement-breakpoint` comment line, or
`yarn dbsync` can silently report success without executing all of them — the exact bug found and
fixed during `2c` (see its archived design.md/tasks.md), and the same shape `2d`'s post-review
correction (its tasks.md 7.2) applied when it added indexes and a unique constraint after its
initial single-statement migration.

**10. Test schema barrel — re-export, not duplicate.** Following `2a`-`2d`'s pattern:
`tests/integration/db/testSchema/hazardousEventCausalityTable.ts` `export * from
"~/domains/hazardous-events/infrastructure/hazardousEventCausalityTable"`, avoiding drift between
the real and test schema.

**11. No enum column.** The diagram shows no enumerated column on this table (unlike
`eventCausalityTable`'s `triggering_entity_type`/`triggered_entity_type`). The only `check()` here
is Decision 4's self-reference constraint.

**12. Cross-tenant cause/effect pairs are allowed, deliberately — not an oversight.** Nothing
constrains `cause_hazardous_event_id` and `effect_hazardous_event_id` to the same tenant. This was
flagged in code review as resembling Phase 0's untenanted-join bugs (`0f`, `0d`), but it isn't the
same class of problem: those were gaps nobody had considered. Here, cross-tenant causality is a
real, confirmed business requirement — transboundary hazards (e.g. an upstream flood in one
country causing a disaster in a neighbouring one, not necessarily adjacent) routinely cross
tenant/country boundaries, and a same-tenant-only constraint would make genuine cases
unrepresentable. No existing DRR-domain standard (Sendai Framework, UNDRR guidance) prescribes a
technical mechanism for this; the general engineering pattern with the strongest precedent is an
explicit, per-record sharing grant (Salesforce's `<Object>Share` table model: a separate row per
grant — owning tenant, shared-with tenant, granted-by, reason — checked at read/write time, not a
blanket cross-tenant visibility rule). Building that mechanism (reliable, secure, on-demand
cross-tenant access to a specific `hazardous_event`) is a distinct, unsolved product/architecture
question — out of scope for this schema-only intent, and premature before Phase 3's domain/use-case
layer exists. This schema deliberately doesn't block the future capability; it also doesn't
implement it yet.

## Risks / Trade-offs

- [Cascade delete on both FKs (Decision 3) means deleting either the cause or the effect
  `hazardous_event` silently removes the causality link] → matches the user-confirmed,
  causality-specific precedent (`eventCausalityTable`); acceptable because nothing else
  references this table yet.
- [Two cross-package FKs from a new `infrastructure/` table into legacy
  `app/drizzle/schema/hazardousEventTable.ts` (Decision 8)] → explicitly flagged here and in
  proposal.md as a narrow, necessary exception, not a precedent; broader than `2d`'s one-FK case
  but same category.
- [The self-reference CHECK (Decision 4) only catches the 1-length degenerate case; a genuine
  n-length cycle (A causes B causes C causes A) is NOT blocked at the DB level] → deliberate,
  per resolved open decision #7 and Invariant 3 — `3c` must implement the domain-layer check with
  its own domain error; this CHECK is not a substitute and must not be treated as having already
  satisfied that rule when `3c` lands.
- [No same-tenant constraint on cause/effect (Decision 12) — a real, open product question, not a
  defect] → cross-tenant causality is a confirmed real requirement with no settled technical
  mechanism yet (no sharing/grant model exists in this codebase or in any external DRR standard);
  flagged for a dedicated architecture decision before Phase 3c/5 builds the domain logic and
  access control around this table — see the roadmap's own note on this question.

## Migration Plan

Additive only — one `CREATE TABLE IF NOT EXISTS` plus two `CREATE INDEX` statements (Decision 9),
no existing table altered, no data migration, no rollback data-loss risk. `yarn dbsync` applies;
a straight `DROP TABLE` migration would fully revert if needed — nothing references this table
today.
