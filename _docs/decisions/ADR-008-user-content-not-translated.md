# ADR-008: User-Generated Content Is Not Translated

## Status
Proposed

## Date
2026-07-23

## Context

ADR-001 names two translation categories: UI strings (file-based) and "content translations... managed via Weblate with content-hash IDs." The existing implementation of the second category (`zeroStrMap` JSONB columns on `sectorTable`, `hipTypeTable`, etc., synced via a git-file export/import pipeline) is for DELTA's own centrally-curated, slow-changing reference vocabulary — not for content admins create dynamically.

Checked against the actual old modules: `hazardousEventTable`/`disasterEventTable` — genuine admin-entered records — store every free-text field as plain `text`, with no translation mechanism at all. There is no existing DELTA precedent for translating admin-authored content.

The first draft of Notices (Phase 4a/4c, and this change's original design) stored `titleJson`/`bodyJson` as JSONB locale maps, requiring the admin to type every supported language into the same notice at creation time. This is unrealistic — an admin writes in one language, not eight — and doesn't match how any existing DELTA content actually works.

## Decision

**Admin/user-authored content is never machine- or human-translated by DELTA.** It is stored and served exactly as written, in the single language the author used. If content needs to reach an audience in more than one language, the author publishes multiple independent records — one per language — not one record with multiple locale variants.

This applies to Notices now, and is the default answer for any future Clean-Architecture domain with similar admin-authored content, unless a specific domain has a documented reason to depart from it.

Concretely for Notices: `titleJson`/`bodyJson` (JSONB `LocaleMap`) are replaced with plain `title`/`body` (`text`) columns, plus a `locale` column recording which language the row is in. No translation pipeline, no fallback-to-another-locale logic, no per-notice multi-language support.

**Static/system strings are unaffected** — UI labels, statuses, error messages — these still go through the existing file-based Weblate workflow (`locales/{{lang}}/{{ns}}.json`). ADR-001 already named the tool for extending this to the REST API surface (`nestjs-i18n`, "adopted only when NestJS exposes external HTTP endpoints") — that condition is now true, so this ADR activates it rather than deciding something new.

## Consequences

**Positive:**
- No translation pipeline to build, run, or get wrong for content that's fundamentally per-tenant and continuously created.
- Matches how DELTA's actual admin-entered records (hazardous/disaster events) already work — no new inconsistency introduced.
- Simple, predictable behavior: what the admin wrote is what every viewer sees.

**Trade-offs:**
- A viewer whose language differs from the notice's author has no in-app translation; they read it as-is or seek translation elsewhere. Explicitly accepted, not solved here.
- A tenant wanting the same announcement in multiple languages must create multiple independent notices — not linked to each other as "the same" content, since nothing tracks that relationship.

## References
- [ADR-001](ADR-001-multilingual-strategy.md) — the two-category translation split this ADR narrows for content specifically; also the source of the `nestjs-i18n` API-surface decision this activates.
- [notices-rest-controller](../../openspec/changes/notices-rest-controller/design.md) — Decision 18/19 implement this for Notices.
