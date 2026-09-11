# Deferred Items Register

A live, working list of things deliberately not being done now — because they're not
necessary yet, belong to a later phase of the current refactor, belong to a different
domain/context, or are genuinely out of scope for any work currently planned. Check this
before wrapping up a phase or scoping a new domain's refactor; remove an entry once it's
picked up and resolved (git history is the permanent record of what was here and why —
this document only reflects current, open items).

Cross-domain, not scoped to any single refactor — new entries from any domain's work go
here, not into a domain-specific copy of this file.

**For agents:** at proposal time (`spec-writer`'s Phase 0), check this table for rows
whose `Domain/Context` matches the intent's own domain/phase; fold a match into the
proposal's scope or flag it to the user rather than silently ignoring it. When declining
to fix something found during implementation, add a row here (in addition to, not instead
of, that change's own `design.md` Risks section) and delete the row for anything this
change resolves.

## Fields

- **ID** — stable, opaque reference (`DEF-NNN`), monotonic, never reused, gaps expected.
- **Category** — `A` opportunistic polish (fix next time this file is touched), `B` later
  phase of the same refactor, `C` blocked on a different domain/context, `D` genuine
  backlog with no committed timeline.
- **Trigger** — the concrete condition that makes this worth revisiting.

| ID | Title | Domain/Context | Category | Detail | Trigger | Origin |
|---|---|---|---|---|---|---|
| DEF-001 | Orphaned `app/backend.server/models/event/` directory | Hazardous Events | B | Entirely dead code (confirmed via `tsc --traceResolution`) — every real HE entry point resolves to `event.ts`, never this directory. Safe to delete once nothing depends on `event.ts` either. | Phase 7 (cutover) | Phase 0 audit, cross-cutting section |
| DEF-002 | `apiAuth`'s dead not-found guard | Shared (auth/API-key, all domains) | B | `if (!key)` never fires since Drizzle `.select()` always returns an array; falls through to an unhandled `TypeError` instead of a 401. Affects every API-key-gated route, not just HE's. | Phase 6 (explicit deliverable) | Phase 0 audit item 2 |
| DEF-003 | E2E harness instability against real Postgres | Shared (test infra) | D | `ECONNREFUSED`/hangs block HE's remaining presentation-layer characterization (delete-guard variants, parent-linking, approval-transition variants). | Whenever 0e's remaining scope is picked back up | Phase 0 audit item 3 |
| DEF-004 | `event_causality` HE↔DE linking has no tenant check | HE/DE boundary | B | `syncLinkedHazardousEvents`/`EventCausalityRepository.createMany` accept a foreign-tenant HE id with zero validation, unlike the singular `hazardousEventId` field, which is correctly guarded. | Phase 4 or 5, whichever owns the new causality-linking use case | Phase 0 audit item 4 (0f finding) |
| DEF-005 | Spatial-footprint "Geographic level" division linking has no tenant check | Hazardous Events | B | `syncHazardousEventSpatialFootprint`'s division-validity check has no `countryAccountsId` filter. Fixed by construction if Phase 3d's `SpatialObservation` entity scopes it from the start. | Phase 3d (SpatialObservation Child Entity) — not yet proposed | Phase 0 audit item 5 (0d finding #1) |
| DEF-006 | Empty-string-vs-null UUID crash pattern | Hazardous Events | B | `HazardousEventFields` types `createdByUserId`/etc. as non-nullable `string`; `""` reaches the DB as a raw UUID-parse failure. Found independently twice. `3a`'s `WorkflowInstance` already types its own attribution fields `string \| null`; `3b` (`HazardousEvent`) needs the same treatment. | Phase 3 (Domain Entity) — partially closed by `3a`, `3b` still open | Phase 0 audit item 6 |
| DEF-007 | Stale `hazardousEventTableConstraits.hipTypeId` constraint name | Hazardous Events | B | Hardcoded constraint name doesn't match the live one (`hip_class` vs `hip_type`), so a real FK violation falls through to a generic form-level error. Moot the moment `7d` deletes the only consumers. | Phase 7d | Phase 0 audit item 7 / `2i` code review |
| DEF-008 | `effectDetails.ts`/`geographicImpact.ts` analytics rewrite | HE analytics | B | `getEffectDetails` is uncallable today (dead `spatialFootprint` refs post-column-removal) plus a `hipTypeId`/`hipHazardId` copy-paste bug. Needs a full rewrite against the new `hazard_type`/`hazard_cluster`/`specific_hazard` schema, not a patch. | Phase 6 or 7 (exact phase not yet decided) | Phase 0 audit item 8 / `ca-he-hazard-filter-fixes` |
| DEF-009 | Three-way `status` column overlap + `zeroText()` convention | Hazardous Events | B | `status`/`approvalStatus`/`hazardousEventStatus` overlap; most text columns use `NOT NULL DEFAULT ''` purely to avoid null-handling in old app code, conflicting with Invariant 3. | Phase 7e | Phase 0 audit item 9 / `2j` readiness check |
| DEF-010 | Direct-publish-without-prior-validation policy question | validation-workflow | D | `3a`'s `publish()` fixes the data-attribution bug (never overwrites a real validator) but doesn't resolve whether direct publish should be a legitimate path at all, or require `validate()` first. Needs a PM decision. | PM decision, no phase assigned | Phase 0 audit, 0c finding #1 |
| DEF-011 | HIP hierarchy / `source_catalog` / hazard-type-field tables — extract to shared infra | HE/DE (shared taxonomy) | C | `specific_hazard`→`hazard_cluster`→`hazard_type`→`hips_version` (`2b`), `source_catalog` (`2c`), and the hazard-type field-definition tables (`2h`) currently live in HE's own `infrastructure/`, but DE/DR also consume the legacy `hip_hazard`/`hip_cluster`/`hip_type`/`data_source` today. | Disaster Events' own CA migration (schema phase) | `2b`/`2c`/`2h` design.md "Schema location" notes |
| DEF-012 | Cross-tenant causality sharing — no access-control mechanism | Hazardous Events (`hazardous_event_causality`) | B | Cause/effect pair deliberately allows cross-tenant links (real transboundary hazard need, e.g. Nepal→India floods) but no sharing/access-control mechanism exists. Leading candidate: explicit per-record sharing grants (Salesforce `<Object>Share`-style), not yet decided. | Before Phase 3c (Causal-Chain Domain Logic) or Phase 5 builds real access control around this table | `2e` design.md Decision 12 |
| DEF-013 | DE attachment table consolidation preference | Disaster Events (future CA migration) | C | Stated preference: consolidate DE's 4 fragmented attachment tables (legacy + assessment/declaration/response) into one polymorphic table with a stage/type discriminator, rather than replicating the per-stage-table pattern. Not a decision yet. | DE's own CA migration, schema phase | `2g` design comparison |
| DEF-014 | DELTA design-system/token unification | Shared (presentation layer, all domains) | D | No unified theme/token system across PrimeReact/Tailwind/legacy CSS. Agreed strategy: "extract now, re-skin later" — Pass 1 (mechanical token extraction, zero visible UI change) as its own cross-cutting intent, not owned by any single domain's PR. Draft at `design-system-unification-roadmap.md`. | Before the next domain (after HE) reaches its presentation-layer phase | Notices pilot |
| DEF-015 | i18n client-side-nav resource-bundle gap | Shared (i18n, all domains) | D | Client i18next instance doesn't reload on SPA nav to a different namespace/language. Confirmed harmless for Notices (same namespace, no lang switch); will bite the first domain whose pages differ, or a language switcher. | Next domain whose pages use different namespaces, or a language-switcher feature | ADR-001 i18n infra build |
| DEF-016 | `useViewContext()` `.lang`/`.t` coupling | Shared (i18n/translation system) | D | `useViewContext()` unconditionally bootstraps the old translation system's global just to expose `.lang`, blocking full retirement of that system until untangled. Every domain migrating to `react-i18next` hits this. | Once enough domains have migrated that retiring the old bootstrap is a real near-term goal | Notices i18n upgrade |
| DEF-017 | ADR-006 auth hardening (JWT/IdP/session revocation) | Shared (auth) | D | Full draft ADR + implementation roadmap exists but the user has explicitly not reviewed/approved it. Do not start any intent from it until revisited. | User explicitly revisits and confirms | 5c scoping conversation |
| DEF-018 | Legacy `hazardousEventTable` relocation to domain infra | Hazardous Events | B | Stays in `app/drizzle/schema/` until `7d` removes its legacy consumers, then relocates to `app/domains/hazardous-events/infrastructure/` as part of `7e`'s own column-drop work. Also unresolved: whether the ER diagram's `title`/`source_catalog_id` columns (never implemented by any Phase 2 intent) should become real columns, stay aspirational, or be dropped from the diagram. | Phase 7e | Roadmap's "Legacy file disposition" section / diagram reconciliation |
