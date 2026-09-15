# ADR-009: Clean Architecture Module Structure — Context-First, Layers Nested Inside

## Status

Proposed

## Date

2026-09-01

## Context

Two Clean Architecture domains exist or are in progress under `app/domains/`: Notices (shipped)
and Hazardous Events (Phase 0 behavior audit complete, scaffolding in PR review). Both follow the
same shape, established by the Notices pilot and carried forward into the HE
scaffold:

```
app/domains/<context>/
  domain/
  application/
    use-cases/
    ports/
    dto/
  infrastructure/
  presentation/
```

An alternative architecture was proposed during HE's planning: organize by technical layer at the
root instead — `app/{core,infra,api,web}/<context>/...` — with each layer folder containing a
subfolder per bounded context. No prior ADR addressed this (`_docs/decisions/` had none on
module/folder structure before this one). Since this same question will recur for every future
domain (validation-workflow, disaster-events, and beyond), it's worth settling once rather than
re-litigating per domain.

**External research:**

- [How To Approach Clean Architecture Folder Structure](https://milanjovanovic.tech/blog/clean-architecture-folder-structure)
  recommends layer-first at the root (`Domain`/`Application`/`Infrastructure`/`Presentation`,
  features nested inside each layer) — but never addresses systems with more than one business
  domain. It reflects the common shape of single-bounded-context Clean Architecture projects
  (the classic .NET reference-template style), not a multi-domain system.
- [Modular Monolith with DDD](https://github.com/kgrzybek/modular-monolith-with-ddd) — one of the
  most-cited reference implementations for **multiple** bounded contexts in one codebase — nests
  `Domain`/`Application`/`Infrastructure` _inside_ each module, matching DELTA's current shape
  exactly. The Project's README names the debate directly: "Application, Domain and Infrastructure
  assemblies could be merged into one assembly. Some people like horizontal layering or more
  decomposition, some don't" — but even that disagreement is about splitting layers _within_ a
  module, never about putting modules inside layers.
- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) (Jimmy
  Bogard, the originating source) supplies the mechanism: layer-first organization couples
  changes horizontally across layers for every feature, and rigid inter-layer rules ("controller
  must talk to service must use repository") stop paying for themselves once a codebase isn't one
  uniform, simple domain.

DELTA is unambiguously in the multi-bounded-context category the second and third sources
describe: Notices already shipped as pilot for an independent domain, HE and validation-workflow are next,
and more domains are expected via the Strangler Fig migration strategy. This ADR settles which
convention applies given that reality, not in the abstract.

**A related question, recorded here for completeness:**
whether a presentation layer should call use-cases directly or go through the REST API. The Pilot domain
already answers this empirically — both `notices+/_index.tsx`/`$id.tsx` (SSR loaders) and
`NoticesController.server.ts` (REST, `/api/v2/notices`) call the same use-cases independently,
confirmed via `openspec/changes/archive/2026-07-10-ca-notices-route-adapter/design.md`'s
Non-Goal ("No REST API controller — Phase 5c") and
`.../2026-07-27-notices-rest-controller/design.md`'s Non-Goal ("Any change to the web channel —
untouched"). Each presentation adapter is a peer of the others, never a dependency of one on
another — this ADR's module-structure decision assumes and reinforces that shape.

## Decision

**Organize by bounded context first; nest architectural layers inside each context.** The shape
already in use for Notices and scaffolded for Hazardous Events is the standard going forward for
every domain:

```
app/domains/<context>/
  domain/
  application/{use-cases,ports,dto}/
  infrastructure/
  presentation/
```

**Genuinely cross-cutting code stays at the top level, with no per-context subfolder.**
`app/infrastructure/` and `app/shared/` (NestJS bootstrap, `DomainError`, `ILogger`,
`RequestContextMiddleware`, i18n resolvers) already follow this — confirmed via directory listing,
zero context subfolders exist there today. This is deliberately preserved, not collapsed into the
per-context structure: a file's location already signals "used by every domain" vs. "owned by one
domain," and that signal is worth keeping distinct.

**Every presentation-layer adapter for a context — web routes, REST controllers, and any future
adapter (mobile, GraphQL, etc.) — lives inside that context's own `presentation/` folder.** This
is not a new rule; it is what `app/domains/notices/presentation/` already does (`NoticesController.server.ts`
alongside `NoticeListPage.tsx`/`NoticeDetailPage.tsx`). No separate top-level `api/` or `web/`
layer is introduced. As a context accumulates more than one or two adapters, subfolders _by
adapter type_ inside `presentation/` (e.g. `presentation/web/`, `presentation/rest/`) are the
expected refinement — mirroring how `application/` already splits into `use-cases/`/`ports/`/`dto/`
— not a new architectural layer and not something to pre-build before it's needed.

**The alternatively proposed layer-first-at-root proposal is not adopted**, on the grounds that it is the
correct convention for a different situation (a single bounded context) than the one DELTA is
actually in and growing into.

## Consequences

**Positive:**

- Matches what's already proven in pilot (Notices) — no retroactive reorganization of merged code, no
  inconsistency between domains built before and after this ADR.
- Each bounded context is a single, self-contained directory tree: extractable, deletable, and
  reviewable as one unit — directly supports the Strangler Fig migration strategy, where one
  domain is migrated and shipped at a time.
- Top-level `app/domains/` folder names communicate business capabilities at a glance ("screaming
  architecture"), rather than requiring a reader to cross-reference filenames across four
  technical-layer folders to reconstruct what the system does.
- Structurally discourages accidental cross-context coupling — there is no shared top-level
  `domain/` folder inviting one context to reach into another's internals.
- A PR for one domain's work stays within that domain's own directory tree, rather than touching
  four unrelated top-level folders every time.

**Trade-offs:**

- Auditing a single concern across every context (e.g. "do all REST controllers apply the same
  auth guard pattern") requires searching across N context folders rather than listing one flat
  directory. Mitigated by tooling (a lint rule or a scoped grep/find) rather than restructuring;
  this is a smaller cost than the ones avoided above.
- Genuinely shared logic that two contexts both need has to be deliberately placed in
  `app/infrastructure/`/`app/shared/` rather than naturally falling out of a shared layer folder —
  requires the same discipline already exercised for Notices' shared infra.

## References

- [Modular Monolith with DDD](https://github.com/kgrzybek/modular-monolith-with-ddd) — primary
  precedent for multi-bounded-context module structure.
- [How To Approach Clean Architecture Folder Structure](https://milanjovanovic.tech/blog/clean-architecture-folder-structure) —
  the counter-convention, and why it's standard for single-domain systems specifically.
- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) —
  originating source for organizing by feature/context over technical layer.
- `app/domains/notices/` — the existing, shipped reference implementation this ADR formalizes.
- `_docs/refactoring-plan/hazardous-events-refactoring-roadmap.md` — Phase 1 scaffold already
  follows this shape for Hazardous Events and `validation-workflow`.
- [ADR-003](ADR-003-error-handling-architecture.md) — establishes the presentation-layer
  boundary (Layer 4) this ADR's `presentation/` placement builds on.
