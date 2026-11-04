## Context

See proposal.md - Why/What Changes for the cohesion-over-SRP rationale and
the 4-group merge list. This document covers the technical decisions needed
to execute those merges without breaking anything, and confirms the
layer-boundary investigation that scoped this change to
`presentation/web/` only.

**Layer-boundary investigation (confirms proposal's scope claim):**

- `app/domains/hazardous-events/application/{ports,use-cases}/` and
  `app/domains/hazardous-events/infrastructure/`: inspected directory
  listings. Every port, use-case, Drizzle adapter, and DI token is already
  one-unit-per-file (e.g. `ports/ICausalChainRepository.ts`,
  `use-cases/CreateHazardousEvent.ts`,
  `infrastructure/DrizzleCausalChainRepository.server.ts`,
  `infrastructure/CausalChainRepositoryToken.ts`). No sprawl pattern exists
  there to consolidate.
- `app/domains/validation-workflow/presentation/`: contains only `.gitkeep`
  -- no files exist to consolidate, so this directory is a no-op for this
  change, not an oversight.
- Conclusion: the over-split pattern is real and confined to
  `hazardous-events/presentation/web/`'s non-`.tsx` files. Consolidating
  `application/`/`infrastructure/` would make those layers *inconsistent*
  with the rest of the codebase, not more consistent -- out of scope by
  design, not by omission.

## Goals / Non-Goals

**Goals:**

- Reduce the 9 over-split source files named in the 4 approved groups (10
  counting `isStatusAwareEditBlocked.ts`, which was in scope for discussion
  but ends up excluded -- Decision 1) to 4 cohesive consolidated modules,
  with every exported symbol name unchanged. This does not touch the
  directory's other single-purpose files that were never part of the
  approved scope (e.g. `requireViewDataPermission.server.ts`,
  `parsePagination.ts`, `workflowStatusDisplay.ts`) -- those stay as they
  are.
- Add real test coverage for `composeWorkflowAction`/
  `buildWorkflowComposerCallbacks`, which currently have none.
- Leave every call site, including the one unavoidable application-layer
  test import, in a working, green state at every task boundary.

**Non-Goals:**

- No change to `application/`, `infrastructure/`, or
  `validation-workflow/application/` file organization (see layer-boundary
  investigation above).
- No behavior change in Groups 1, 2, 4 -- relocation only.
- No new business requirement for Group 3 -- the new tests characterize
  the *existing* shipped behavior of `composeWorkflowAction`/
  `buildWorkflowComposerCallbacks`, they do not change it.
- No Gate 9 (visual/UX parity) -- nothing under `app/routes/` renders
  differently; only non-`.tsx` server/pure-function files move. No
  reference-source checklist applies.

## Decisions

### Decision 1: `isStatusAwareEditBlocked.ts` is excluded from the Group 1 merge

The originally-discussed Group 1 grouping included `isStatusAwareEditBlocked.ts`
as a 5th file. Investigation during Phase 0 found its own existing comment:

> "not `.server.ts`-suffixed so the latter can call it isomorphically"

and two real, direct importers that are presentation **components**, not
server-only route modules:

- `HazardousEventDetailPage.tsx` (Edit-link visibility gate)
- `HazardousEventListPage.tsx` (status-aware Edit link before the View link)

Folding this predicate into `requestAuthorizationGuards.server.ts` would move
an isomorphic, client-safe pure function into a `.server.ts`-suffixed module,
which the project's server-only-file convention (`.server.ts(x)` = stripped
from the client bundle) would make unreachable from those two `.tsx`
components at build or runtime. This is a hard technical constraint, not a
style preference, and it was deliberately engineered this way in
`ca-he-route-adapter-write` -- reversing it is out of scope here.

**Mock audit (read all 4 pre-merge test files to check for conflicting
module-level `vi.mock`s before writing "merge verbatim" into tasks.md)**:
only `requireEditDataPermission.server.test.ts` has a module-level mock --
`vi.mock("~/utils/session", () => ({ getUserRoleFromSession: vi.fn() }))`.
`requireStatusAwareEditPermission.server.test.ts` and
`requireWorkflowActionAuthorized.server.test.ts` have no mocks at all (they
exercise `throwHazardousEventLoaderError`/`isStatusAwareEditBlocked`/
`isWorkflowActionAuthorized` for real). `requireValidValidatorIds` has no
prior test (task 2.1 writes one). Since `vi.mock` is file-scoped and neither
of the other two guards' production code calls `getUserRoleFromSession`,
mocking it has no effect on their test cases once all four land in one file
-- **no mock conflict exists, "merge verbatim" holds as written** for Group
1. (Groups 2 and 4's pre-merge test files have zero `vi.mock` calls each --
checked, confirmed, no reconciliation needed there either.)

**Decision: Group 1 merges 4 files (`requireEditDataPermission.server.ts`,
`requireStatusAwareEditPermission.server.ts`,
`requireWorkflowActionAuthorized.server.ts`,
`requireValidValidatorIds.server.ts`) into `requestAuthorizationGuards.server.ts`.
`isStatusAwareEditBlocked.ts` (+ its existing test) is left exactly where it
is.** `requireStatusAwareEditPermission` (now inside the consolidated file)
keeps importing it from its unchanged relative path -- a one-line import
staying the same, not changing.

**Alternative considered**: merge it anyway and re-export it without the
`.server.ts` suffix from a thin separate file. Rejected -- this reintroduces
a small single-purpose file (the opposite of this change's goal) purely to
route around a self-inflicted problem, and adds an indirection hop for no
benefit.

### Decision 2: merge order is dependency-driven, not the proposal's 1-2-3-4 listing order

Reading the actual files (not assumed from the proposal's narrative order)
found real cross-group imports:

- `requireWorkflowActionAuthorized.server.ts` (Group 1) imports
  `mapTempActionToWorkflowAction`/`MappedWorkflowAction` from Group 4.
- `requireValidValidatorIds.server.ts` (Group 1) imports `MappedWorkflowAction`
  (type-only) from Group 4.
- `composeWorkflowAction.server.ts` (Group 3) imports
  `MappedWorkflowAction` (type-only) and `deriveRecordDate` from Group 4.
- Group 3's `buildWorkflowComposerCallbacks.server.ts` half has no
  cross-group imports.
- Group 2 (`extractFieldError.ts`, `extractCauseConflictError.ts`) has no
  cross-group imports in either direction -- fully independent.

**Decision: execute in the order Group 4 -> Group 1 -> Group 3, with Group 2
done at any point (independent).** Group 4 is a leaf (nothing in scope
imports *into* it except Groups 1 and 3), so merging it first means Groups 1
and 3 each do a single one-time import-path update (to `formDataMappers.ts`)
as part of their own merge step, rather than needing a second pass. tasks.md
reflects this real order, not the proposal's narrative 1/2/3/4 numbering.

### Decision 3: Group 4's combined file name

`mapTempActionToWorkflowAction.ts` and `deriveRecordDate.ts` are both small,
pure route-layer form-data mapping helpers with no shared type or call
relationship to each other (unlike Groups 1 and 3, which have a real
coupling). Named `formDataMappers.ts` -- descriptive of what the two
functions are (mappers operating on parsed form data), without overclaiming
a shared purpose beyond that. Consolidated test file: `formDataMappers.test.ts`.

### Decision 4: the one necessary application-layer edit, and the one left stale

Two places outside `presentation/web/` reference these file names by path,
found by grepping the whole `app/` tree (not assumed from this session's
earlier exploration):

1. `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`
   line 13: a real `import { requireWorkflowActionAuthorized } from
   "~/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server"`,
   exercised later in the file's cross-call-site-agreement parameterized test.
   **This import breaks when the old file is deleted.** Updating it to
   `~/domains/hazardous-events/presentation/web/requestAuthorizationGuards.server`
   is a one-line, mechanical import-path fix -- it changes neither the test's
   assertions nor any application-layer logic or file organization. Treated
   as an explicit, narrow exception to "do not touch `application/`" because
   the alternative (a guaranteed-broken test) is strictly worse. Flagged here
   for human sign-off rather than silently folded into the Group 1 task.

   **Verified, not assumed, that this import-path swap is genuinely one line
   and not a hidden multi-file fix**: after the merge, importing
   `requireWorkflowActionAuthorized` from the consolidated file transitively
   loads the whole module, including `requireEditDataPermission`'s own
   imports (`~/utils/session`, `~/frontend/user/roles`), which
   `isWorkflowActionAuthorized.test.ts` never transitively touched before.
   Note: `requireEditDataPermission.server.test.ts`'s own
   `vi.mock("~/utils/session", () => ({...}))` uses a factory, which means
   Vitest replaces the module entirely and **never evaluates the real
   `session.ts`** -- that existing test is not evidence the real module
   loads cleanly, and an earlier draft of this document wrongly cited it as
   such. The actual check performed: read `~/utils/session.ts`,
   `~/db.server.ts`, `~/utils/requestContext.server.ts`,
   `~/utils/session-activity-config.ts`, `./lang.backend.ts`,
   `./url.backend.ts`, and `./url.ts` in full (not excerpts). None contains
   a module-scope call that performs I/O, reads `process.env`, or throws --
   the only module-scope calls present are `new AsyncLocalStorage()`
   (`requestContext.server.ts`) and `customType<...>({...})` (`url.ts`),
   both pure, synchronous, in-memory constructors; `initCookieStorage()`
   (the only place `SESSION_SECRET` is read) is defined but never invoked at
   import time. `~/drizzle/schema`'s index (also read in full) re-exports
   ~60 table-definition files, each expected to call Drizzle's `pgTable(...)`
   builder at module scope -- the individual table files were not all
   opened, but `pgTable()` is a documented pure/synchronous schema-metadata
   constructor with no I/O, and `~/db.server.ts` already imports this same
   `* as schema` at its own module scope as an already-accepted part of this
   codebase. Importing the real, unmocked chain is therefore expected to be
   safe, with the one unverified link (the individual table files) named
   explicitly rather than folded into "verified." **Contingency**: if task 2.4's
   verification run shows `isWorkflowActionAuthorized.test.ts` failing at
   import (not at an assertion) after the merge, that contradicts this
   analysis -- stop and ask rather than silently adding a `vi.mock` to an
   application-layer file, which would widen this exception beyond the
   one-line import-path change approved here.
2. `app/domains/validation-workflow/application/isWorkflowActionAuthorized.ts`
   line 14: a comment naming `requireWorkflowActionAuthorized.server.ts`
   (HE presentation) as one of its two callers. This file name disappears
   after the merge. **Decision (revised, coordinator-approved): fix this
   comment as part of this change.** It is the same file whose test (line
   13) already needs the mechanical import-path exception in Decision 4.1
   -- updating the one-line prose comment to name
   `requireWorkflowActionAuthorized` (now in `requestAuthorizationGuards.server.ts`)
   is a one-line accuracy fix, not a refactor of `application/` logic or
   file organization, so it rides alongside the already-approved exception
   for that same file rather than being a separate scope expansion. See
   tasks.md task 2.5.
3. `app/domains/validation-workflow/application/use-cases/ProcessWorkflowAction.ts`
   line 95: a comment naming `composeWorkflowAction.server.ts`. **No action
   needed** -- Group 3 keeps that exact file name, so this comment stays
   accurate.

### Decision 4a: one main spec needs a filename-citation fix, found by checking all three hits, not just the first

Grepping all of `openspec/specs/` for the 9 old file paths (not just the one
spec file inspected first) found three hits:
`hazardous-event-write-route-adapter` (function names only, confirmed
unaffected), `hazardous-event-list-filters` (two `.tsx`-component file-path
mentions, unrelated to this change's scope), and
`hazardous-event-route-adapter`, which cites
`requireStatusAwareEditPermission.server.ts` by filename in one requirement's
prose (the "HE detail page renders an 'Edit' link..." requirement). That
filename disappears into `requestAuthorizationGuards.server.ts`.

**Decision: this is a Modified Capability** (`hazardous-event-route-adapter`),
with a delta spec that copies the full requirement block (per the MODIFIED
workflow) and updates only the filename citation to
"`requireStatusAwareEditPermission` (in `requestAuthorizationGuards.server.ts`)"
-- no scenario, behavior, or normative wording changes. Unlike the
application-layer comment in Decision 4.2, this lives in `openspec/specs/`,
which this change's scope ban does not cover, and a spec's accuracy is the
project's own living contract -- it should not be left citing a file that no
longer exists.

### Decision 5: Group 3 test infrastructure

`composeWorkflowAction`/`buildWorkflowComposerCallbacks` have zero existing
tests, so the new `composeWorkflowAction.server.test.ts` is written from
scratch against the current (pre-merge) split files, per tasks.md's RED step,
then re-verified green after the merge. It needs:

- `vi.mock("~/init.server", () => ({ getAppContext: vi.fn() }))` -- **with an
  explicit factory**, not bare `vi.mock("~/init.server")`. Vitest's automock
  (what a bare call does) imports the real module first to infer its shape,
  which would run `init.server`'s own bootstrap -- exactly what this mock
  exists to avoid. `getAppContext` is then stubbed per-test to return an
  object whose `.get(GetHazardousEventByIdUseCase)`/
  `.get(FindValidatorCandidatesUseCase)` return fake use-case instances
  (`buildWorkflowComposerCallbacks` calls `getAppContext().get(...)`
  directly -- no constructor injection to swap in a real DI mock here).
  - A fake `ProcessWorkflowActionUseCase` (constructor-injected into
  `composeWorkflowAction`, no module mock needed for it).
- `vi.mock("~/infrastructure/logging/PinoLogger.server", () => ({
  getPinoLogger: vi.fn() }))` -- again with an explicit factory, for the
  same automock-avoidance reason -- stubbed per-test to return an object
  with a `warn` spy, to assert the `outcome: "failed"` path logs
  `msg: "hazardous_event.workflow_action_failed"`.
- Coverage for: the `mappedAction === null` early return
  (`{ attempted: false }`); the `submit-validation` path's
  `getRecordDisplayName`/`recordDate` derivation via `deriveRecordDate`; the
  `direct-validate`/`direct-publish`/other-action paths that skip
  `getRecordDisplayName`; the `outcome: "failed"` catch path; and
  `buildWorkflowComposerCallbacks`'s display-name fallback chain
  (`specificHazardName` -> `hazardClusterName` -> `hazardTypeName` -> `""`)
  and its `excludingUserId: actingUserId` exclusion.
- These are characterization tests written against already-shipped
  behavior, not a Red-phase proof of a bug -- they pass on first run. That is
  expected and correct for this change (pure refactor + retroactive test
  coverage, not a behavior fix).

**Known equivalent mutants, declared upfront so task 3.5 doesn't loop on
them**: `composeWorkflowAction`'s `direct-validate`/`direct-publish` branch
and its final `else` branch (the catch-all for `submit-draft` and any other
non-`submit-validation` mapped action) call `processWorkflowActionUseCase.execute`
with byte-identical argument shapes (lines ~58-77 in the pre-merge file).
Condition mutants that swap which branch runs are not killable by any test
of *this* function's own behavior, because both branches do the same thing
-- the distinction only matters if a future caller passes an action this
function doesn't special-case. This is expected, declared now, and MUST NOT
be "fixed" by collapsing the branches (that would obscure the two
conceptually distinct cases the switch documents) or by weakening/padding
the test suite to force a kill.

**Mutation testing**: per explicit coordinator direction (superseding the
general "any `app/domains/**` file with real logic gets a test-quality-auditor
pass" standing rule for this change specifically), mutation testing is
**skipped for the lift-and-shift portions of Groups 1, 2, and 4** --
`requireEditDataPermission`, `requireStatusAwareEditPermission`,
`requireWorkflowActionAuthorized`, `extractFieldError`,
`extractCauseConflictError`, `mapTempActionToWorkflowAction`, and
`deriveRecordDate` are genuinely pure relocations, existing tests are the
regression safety net, no new behavior to verify. It is **included for
two previously-zero-coverage functions**, both coordinator-approved:
`composeWorkflowAction.server.ts` (Group 3, tasks.md 3.5) and
`requireValidValidatorIds` (Group 1, tasks.md 2.6) -- same reasoning for
both: the tests written for them are brand new coverage for
previously-completely-untested logic, and mutation testing is the check
that those new tests actually exercise the behavior rather than just
running it. `requireValidValidatorIds`'s own logic has no known
equivalent-mutant pair (a single linear path, unlike `composeWorkflowAction`'s
two byte-identical branches) -- if the auditor finds one anyway, that is new
information to record here, not something to have been predicted. If
Stryker hits the known DEF-041 implements-clause crash on either pass, note
it here rather than registering a new deferred-items entry (per standing
project convention) -- not expected, since none of these files use an
`implements` clause, but noted as a contingency.

**Contingency triggered for `composeWorkflowAction.server.ts` (task 3.5)**:
Stryker crashed during instrumentation with the same underlying
`@babel/generator` printer bug as DEF-041, but via a third, previously
undocumented trigger shape: `buildWorkflowComposerCallbacks`'s inline
return-type object literal (`{ getRecordDisplayName: (id: string) =>
Promise<string>; getValidCandidateIds: () => Promise<string[]> }`) has
arrow-function-typed properties, structurally the same `TSPropertySignature`
+ `TSFunctionType` shape DEF-041 already names for `interface` method
signatures, just spelled as an inline type literal instead of a named
`interface`. Because the whole file must be instrumented together, this
blocked mutation testing for `composeWorkflowAction` itself too, even though
its own body has no such shape. No mutants were generated; no mutation
score or equivalent-mutant confirmation is available for this file. Per
standing convention, no new deferred-items-register entry was created --
this is DEF-041's existing bug class, not a new one. Production code was not
changed to dodge the crash (e.g. naming the return type as a top-level
`interface`) since that is a shape change made solely to satisfy tooling,
not a behavior or design need -- left as-is.

**Contingency also triggered for `requestAuthorizationGuards.server.ts`
(task 2.6)**: same fatal Stryker/Babel instrumentation crash, but via a new
variant of the DEF-041 bug class: `requireValidValidatorIds`'s own
`getValidCandidateIds: () => Promise<readonly string[]>` parameter is a
`TSPropertySignature`+`TSFunctionType` inside a `TSTypeLiteral` used in
*parameter*-annotation position, not return-type position as in the
`composeWorkflowAction.server.ts` occurrence above -- confirming the bug
class fires on either position. No mutants were generated for any of the
file's 4 functions; no mutation score or equivalent-mutant confirmation is
available for `requireValidValidatorIds`. No new deferred-items-register
entry created (same standing convention); production code left unchanged.
Net effect for this change: neither of the two mutation-testing passes
mandated by Decision 5 could run to completion -- both are blocked by the
same pre-existing tooling limitation, not by anything introduced here. The
8 new `requireValidValidatorIds` tests and the 20 new `composeWorkflowAction`
tests remain the regression safety net for this change, same as the
lift-and-shift groups' existing tests, verified by Vitest (gate 1) and
`yarn tsc` (gate 2) instead.

### Decision 6: no concurrent-callers scenario in the spec

The spec-quality standing rule requires a concurrent-callers scenario for any
requirement involving shared mutable state accessed by async operations
(caches, counters, stores, queues). None of the 4 groups introduce or touch
any such state -- `composeWorkflowAction`/`buildWorkflowComposerCallbacks`
are per-request, stateless compositions with no module-level cache, counter,
or queue. The rule does not apply here; omitted deliberately, not missed.

## Risks / Trade-offs

- **[Risk]** A missed call site leaves a dangling import, caught only at
  `yarn tsc` time or (worse) at runtime. **Mitigation**: every call site was
  found by grepping the whole `app/` tree for each of the 9 old file
  basenames and each exported symbol name, not from memory of this session;
  tasks.md's verification steps run `yarn tsc` after every merge, not just
  once at the end.
- **[Risk]** Consolidating 4-5 files' worth of tests into one file could
  silently drop a test during the merge. **Mitigation**: tasks.md requires
  running the full consolidated test file and comparing the test count
  against the sum of the pre-merge files' test counts before deleting the
  old files.
- **[Risk]** The one application-layer import edit (Decision 4.1) sets a
  precedent that could be read as "the application layer is fair game after
  all." **Mitigation**: this is called out explicitly, twice (proposal.md
  Impact, this document), as a narrow mechanical exception, not a scope
  change -- the application layer's own file organization is untouched.
- **[Trade-off]** Leaving the stale comment in `isWorkflowActionAuthorized.ts`
  (Decision 4.2) means a future reader sees a filename that no longer exists.
  Accepted: the alternative is editing application-layer code in a change
  explicitly scoped to exclude it, for a comment-only concern.

## Migration Plan

No deploy/migration concerns -- this is a same-PR, same-release file
reorganization with no DB, API, or route-URL change. Rollback is a plain
`git revert` of the PR; no data or external state is touched.

## Addendum: 4 small, user-approved fixes from the gate review

Found during the Section 5 gate review of the already-complete
implementation; approved to land here rather than as a separate change,
since all 4 touch files already in this change's scope.

### Fix A: `requireValidValidatorIds` was the one Group 1 function with no
behavioral spec requirement (asymmetric with Group 3's treatment). Resolved
by adding a proper Requirement/Scenario block for it to this change's own
delta spec (`specs/hazardous-event-presentation-module-boundaries/spec.md`),
matching the depth already given to `composeWorkflowAction`/
`buildWorkflowComposerCallbacks` -- grounded in the real implementation in
`requestAuthorizationGuards.server.ts` and its existing test file, not
guessed. No code or test change.

### Fix B: narrow `composeWorkflowAction`'s `processWorkflowActionUseCase` parameter

`composeWorkflowAction.server.ts`'s `processWorkflowActionUseCase` parameter
is typed `ProcessWorkflowActionUseCase` but only ever calls `.execute(...)`
on it. Narrowed to `Pick<ProcessWorkflowActionUseCase, "execute">`, the same
pattern `GetHazardousEventById.ts` already uses for its own constructor
dependencies (`getWorkflowInstanceByEntityUseCase: Pick<
GetWorkflowInstanceByEntityUseCase, "execute">`,
`specificHazardTaxonomyRepository: Pick<ISpecificHazardTaxonomyRepository,
"findNamesByIds">`) -- an established DELTA convention for depending on the
narrowest interface actually used, not a new idea introduced here. Pure
type-level change: the parameter's runtime value and every call site's
argument are unchanged. This also removes the need for
`composeWorkflowAction.server.test.ts`'s
`processWorkflowActionUseCase as unknown as ProcessWorkflowActionUseCase`
casts (12 occurrences) -- a `{ execute: vi.fn()... }` fake already
structurally satisfies `Pick<ProcessWorkflowActionUseCase, "execute">`
without a cast, so those mocks simplify to passing the fake object directly.
No behavior change; existing tests (once their mock types are simplified)
are the regression check -- no new test scenarios needed.

### Fix C: remove `composeWorkflowAction`'s dead `request: Request` parameter

Confirmed by reading the full function body
(`composeWorkflowAction.server.ts`) that `args.request` is never read
anywhere inside `composeWorkflowAction` -- it is destructured nowhere and
referenced nowhere in the function body, only declared in the parameter
type. Both call sites (`new.tsx`, `edit.$id.tsx`) pass `request` into it
today for no effect. Removed from the function's parameter type and from
both call sites' argument objects, and from
`composeWorkflowAction.server.test.ts`'s existing calls (which construct and
pass a `request` object to every `composeWorkflowAction(...)` call). Pure
dead-parameter removal; existing tests are the regression check -- no new
test scenarios needed. (Note: `buildWorkflowComposerCallbacks` and the other
guard functions in this file/directory that also take a `request` param do
use it, e.g. for `throwHazardousEventLoaderError`'s `url` -- this fix is
scoped to `composeWorkflowAction` only, where it is genuinely unused.)

### Fix D: pre-existing, unrelated bug -- misleading test title in `isStatusAwareEditBlocked.test.ts`

The test at `isStatusAwareEditBlocked.test.ts` line 39, titled "is blocked
for a null/undefined role", asserts `.toBe(false)` for both the `null`- and
`undefined`-role cases at a non-blocked status (`"DRAFT"`) -- the title
contradicts its own assertion. Checked against the real implementation
(`isStatusAwareEditBlocked.ts`): the predicate returns `true` only when
`role === "data-viewer"` OR `workflowStatus` is one of the blocked statuses;
a `null`/`undefined` role matches neither `"data-viewer"` nor (at `DRAFT`) a
blocked status, so the correct, already-shipped behavior is **not blocked**
-- the assertion (`false`) and the real behavior are correct; only the test
title is stale/wrong. Fix: reword the title to "is not blocked for a
null/undefined role (at a non-blocked status)" to match its own assertion.
This predates this change and is unrelated to the consolidation itself;
previously confirmed not a live security gap, since `roleHasPermission`/
`requireEditDataPermission` already deny null/undefined roles upstream,
before this predicate is ever reached -- a test-clarity fix only, no
production code change.

## Open Questions

- `requireViewDataPermission.server.ts` is an equally single-purpose file in
  the same directory, structurally parallel to the 4 Group 1 guards, but it
  was not included in the approved scope for this change. Left out here, and
  flagged for a human decision on whether a future follow-on should fold it
  into `requestAuthorizationGuards.server.ts` too -- not resolved in this
  change because it was not part of what was approved.
