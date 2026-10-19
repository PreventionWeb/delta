## REMOVED Requirements

### Requirement: existing taxonomy names are preserved across the multi-language migration

**Reason**: This requirement described `5l`'s own migration
(`app/drizzle/migrations/20261008000000_add_shared_multilang_taxonomy.sql`), which added
`name_text_content_id` to the three hazard tables via an `ADD COLUMN` → backfill-`UPDATE`
→ backfill-`INSERT` → `SET NOT NULL` → `DROP COLUMN name` sequence against the live rows
that existed under `2b`'s original schema. That migration is retracted
(`ca-he-multilang-taxonomy-reconciliation`) in favor of a parallel, independently-built
migration (tickets #774/#794) that does a structurally different full `DROP`+rebuild of
these three tables from a fresh import of the legacy `hip_class`/`hip_cluster`/
`hip_hazard` tables, assigning new deterministic hash-based UUIDs. There is no
"pre-existing row's `name` is preserved" scenario to specify against that migration — it
does not preserve the old UUID-keyed rows at all; it replaces them outright from the
legacy source.

**Migration**: No replacement requirement in this capability. The shape and constraint
requirements for `hazard_type`/`hazard_cluster`/`specific_hazard` (`name_text_content_id`
NOT NULL + FK, `source_ref_id` nullable + unique, etc.) are unchanged and continue to
apply to the adopted migration's rebuilt tables. Any future requirement describing the
adopted migration's own data-fidelity guarantees (e.g., "every legacy `hip_hazard` row has
a corresponding `specific_hazard` row") belongs to whichever intent owns that migration's
own specification, not this one.
