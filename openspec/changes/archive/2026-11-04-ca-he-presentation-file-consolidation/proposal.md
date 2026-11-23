## Why

`ca-he-route-adapter-write`'s presentation layer
(`app/domains/hazardous-events/presentation/web/`) accumulated several small,
single-purpose non-`.tsx` files (guards, extractors, mappers, a two-part
workflow-composer pair) that a code-review discussion flagged as over-split.
Web research during that discussion confirmed cohesion -- not file count -- is
the correct criterion for file boundaries (Robert C. Martin's SRP is "one
reason to change," not "one function per file"; no authoritative TypeScript or
Clean Architecture source mandates one-function-per-file). A follow-up audit
confirmed the pattern is isolated to this one directory: `application/`,
`infrastructure/`, and `validation-workflow/` already use one-unit-per-file
consistently across the whole domain, predating this intent, and must stay
that way. This change consolidates the over-split presentation-layer files
into cohesive modules without touching the correctly-granular layers.

## What Changes

- Merge 4 authorization/well-formedness guard files into one new
  `requestAuthorizationGuards.server.ts` (+ one consolidated test file).
  **Deviation from the originally-discussed 5-file grouping**: the 5th file,
  `isStatusAwareEditBlocked.ts`, stays standalone -- it is deliberately *not*
  `.server.ts`-suffixed (per its own existing comment) because two `.tsx`
  presentation components (`HazardousEventDetailPage.tsx`,
  `HazardousEventListPage.tsx`) import it directly for isomorphic (client +
  server) use. Folding it into a `.server.ts` file would break that explicit,
  already-shipped design decision from `ca-he-route-adapter-write`. See
  design.md Decision 1.
- Merge 2 form-error-extractor files into one new `extractFormFieldErrors.ts`
  (+ one consolidated test file).
- Merge 2 workflow-action-composition files into one `composeWorkflowAction.server.ts`
  (keeps this name -- it is the more central of the pair) and add genuinely
  new test coverage: both files currently have **zero** tests despite real,
  non-trivial logic.
- Merge 2 small route-layer mapping helpers into one new `formDataMappers.ts`
  (+ one consolidated test file).
- Every exported function/symbol name is unchanged -- this is a file-location
  change, not an API change. Every call site across `app/` (and one
  application-layer test file, see Impact) that imports from any of the 9
  deleted file paths is updated to the new consolidated path.
- No behavior change for the guard/extractor/mapper merges (Groups 1, 2, 4) --
  existing tests, relocated and consolidated, are the regression safety net.
  The workflow-composition merge (Group 3) is the one place this change adds
  real new test coverage, because none existed.

## Capabilities

### New Capabilities

- `hazardous-event-presentation-module-boundaries`: documents the
  module-boundary guarantees of the consolidated presentation-layer files
  (export-surface stability across the merges, the isomorphic-import
  constraint that keeps `isStatusAwareEditBlocked.ts` standalone) and
  specifies the previously-unspecified behavior of
  `composeWorkflowAction`/`buildWorkflowComposerCallbacks` now that it is
  getting real test coverage for the first time.

### Modified Capabilities

- `hazardous-event-route-adapter`: one requirement ("HE detail page renders
  an 'Edit' link...") cites `requireStatusAwareEditPermission.server.ts` by
  filename in its prose; that file disappears into
  `requestAuthorizationGuards.server.ts`. The delta updates only that
  filename citation -- no scenario or behavior changes. Found by grepping
  every file under `openspec/specs/` (not just the one spec checked first)
  for the 9 old file paths.

Checked and confirmed unaffected (function names only, no file-path
citations that go stale): `hazardous-event-write-route-adapter`,
`hazardous-event-list-filters` (its two file-path mentions are `.tsx`
component files, out of this change's scope entirely).

## Impact

**Files merged/deleted (9 old -> 4 new consolidated files, 1 file
intentionally excluded):**

- `requireEditDataPermission.server.ts` (+test) -> `requestAuthorizationGuards.server.ts`
- `requireStatusAwareEditPermission.server.ts` (+test) -> `requestAuthorizationGuards.server.ts`
- `requireWorkflowActionAuthorized.server.ts` (+test) -> `requestAuthorizationGuards.server.ts`
- `requireValidValidatorIds.server.ts` (no prior test; one written) -> `requestAuthorizationGuards.server.ts`
- `extractFieldError.ts` (+test) -> `extractFormFieldErrors.ts`
- `extractCauseConflictError.ts` (+test) -> `extractFormFieldErrors.ts`
- `buildWorkflowComposerCallbacks.server.ts` (no prior test) -> merged into `composeWorkflowAction.server.ts`
- `mapTempActionToWorkflowAction.ts` (+test) -> `formDataMappers.ts`
- `deriveRecordDate.ts` (+test) -> `formDataMappers.ts`
- `isStatusAwareEditBlocked.ts` (+test): **unchanged, stays standalone** (see What Changes)

**Call sites updated (every import of the 9 old paths, found by grepping the
whole `app/` tree, not assumed from memory):**

- `app/routes/$lang+/_authenticated+/he-preview+/edit.$id.tsx`
- `app/routes/$lang+/_authenticated+/he-preview+/new.tsx`
- `app/routes/$lang+/_authenticated+/he-preview+/picker.tsx`
- `app/domains/validation-workflow/application/isWorkflowActionAuthorized.test.ts`
  -- **narrow, necessary exception to the "don't touch application/" rule**:
  this test file has a real `import { requireWorkflowActionAuthorized } from
  "~/domains/hazardous-events/presentation/web/requireWorkflowActionAuthorized.server"`
  (line 13) that would otherwise break. The edit is a one-line import-path
  change only -- no application-layer logic, test assertions, or file
  organization in that layer is touched. See design.md Decision 4.
- Also edited, one line, coordinator-approved:
  `isWorkflowActionAuthorized.ts`'s comment naming
  `requireWorkflowActionAuthorized.server.ts` (which disappears into
  `requestAuthorizationGuards.server.ts`) -- rides alongside the
  already-approved test-import fix for that same file (see design.md
  Decision 4.2). A prose accuracy fix, not application-layer logic or file
  reorganization.
- Not touched otherwise (confirmed by a whole-repo-root grep, excluding
  `node_modules`, `.git`, and `openspec/changes/archive/`, for every one of
  the 9 old file basenames and the generated Stryker report -- not assumed
  from memory or from `app`/`tests` alone): `ProcessWorkflowAction.ts`
  (comment names `composeWorkflowAction.server.ts`, which keeps its name),
  `HazardousEventEditRoute.test.ts` /
  `HazardousEventNewRoute.test.ts` (prose mentions only, no imports),
  `HazardousEventDetailPage.tsx` / `HazardousEventListPage.tsx` (import
  `isStatusAwareEditBlocked`, which does not move), `hazardous-event-list-filters/spec.md`
  (file-path mentions are unrelated `.tsx` components), `reports/mutation/mutation.html`
  (a generated Stryker report, not source).

**DB migration:** none required -- no schema change.

**Test approach:** PGlite not applicable (no DB access in any of these 9
files); all are plain Vitest unit tests (`yarn vitest run`), consolidated from
existing `*.test.ts` files plus the Group 3 and `requireValidValidatorIds`
additions. Full regression via `yarn test:run2` before archiving.

**Security implications: this change is security-sensitive, low risk.**
Group 1 is 4 authorization-guard files (`requireEditDataPermission`,
`requireStatusAwareEditPermission`, `requireWorkflowActionAuthorized`,
`requireValidValidatorIds`) -- their logic is moved verbatim, not rewritten,
and relocation is covered by the consolidated/new tests plus `yarn tsc`. No
query, schema, multi-tenancy scoping, or `authLoaderWithPerm`/
`authActionWithPerm` wrapper logic changes. One side effect of the merge
needs a reader's attention, not a behavior change: importing
`requireWorkflowActionAuthorized` after the merge transitively loads
`requireEditDataPermission`'s own imports (`~/utils/session`,
`~/frontend/user/roles`) as part of the same module -- verified safe by
reading `~/utils/session.ts` in full plus its 5 local imports and
`~/drizzle/schema`'s index (no import-time side effects anywhere in that
chain: no module-scope function call, `process.env` read, or I/O), with an
explicit contingency if that analysis turns out wrong at verification time
-- see design.md Decision 4.1.
