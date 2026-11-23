# Design

## Context

See `proposal.md` for motivation and file inventory. This change strengthens DELTA's OpenSpec workflow and adds automated static + runtime design-system verification distilled from the 23 ad-hoc `.cjs` scripts in `unisdr/delta-design/example-page-source/`.

This branch (`feature/openspec-design-system-gates`) is created directly from `dev` so it can be reviewed and merged independently of `feature/integrate-delta-design` (which copies `_docs/design/{DESIGN.md,tokens.css,tokens.json}` and self-hosted fonts).

## Goals / Non-Goals

**Goals:**

- Provide typed, reusable Playwright verification helpers (`tests/e2e/helpers/designSystemChecks.ts`) and a Gate 9 CLI (`scripts/check-design-a11y.ts`, invoked via `yarn design:check`) usable by both developers and AI agents.
- Default `axe-core` WCAG 2.2 AA and DOM target-size/label checks to `<main>` so newly built/migrated screens are not blocked by legacy header/footer chrome in `app/root.tsx`, while supporting `--full-page` for standalone pages (e.g. login/reset-password) and dialogs.
- Enforce fast static invariants on `app/design-system/components/` (`yarn test:design`) and validate `_docs/design/tokens.{css,json}` ↔ `app/styles/all.css` `@theme` sync whenever `_docs/design/` is present.
- Upgrade OpenSpec (`openspec/config.yaml`, agents, skills, docs) and add a lightweight PR CI workflow (`.github/workflows/design-system-check.yml`).

**Non-Goals:**

- Copying `unisdr/delta-design`'s 23 prototype `.cjs` scripts verbatim.
- Retroactively fixing WCAG 2.2 AA issues in untouched legacy PrimeReact or `style-dts.css` routes/chrome.
- Requiring a running PostgreSQL database for the PR CI workflow (`design-system-check.yml` runs static Vitest unit checks only).
- Form-CSV-API `fieldsDef` or Drizzle schema changes (none impacted).

## Decisions

### Decision 1: Use `@axe-core/playwright` (`AxeBuilder`) instead of raw `axe.min.js` injection

- **Rationale**: `delta-design`'s `.cjs` scripts inject `node_modules/axe-core/axe.min.js` via `page.evaluate(...)`. `@axe-core/playwright` provides typed TypeScript bindings, handles CSP headers (DELTA's `vite.config.ts` sets strict CSP) and iframes cleanly, and exposes `.include(selector)` / `.exclude(selector)` / `.withTags([...])` natively.
- **Alternative rejected**: Installing bare `axe-core` and manually reading `axe.min.js` from `node_modules`.

### Decision 2: Scope Gate 9 runtime audits to `<main>` by default, with `--full-page` opt-in

- **Rationale**: Existing routes render inside `app/root.tsx`'s legacy header/footer chrome. Scanning full `document` by default would fail every new screen on pre-existing header/footer violations outside the change's scope. Scoping to `<main>` (falling back to `document` when no `<main>` exists, e.g. auth/minimal layouts, or when `--full-page` is passed) makes Gate 9 actionable today while still allowing full-document audits.
- **Alternative rejected**: Full-document scan by default with hardcoded ignore lists for legacy selectors.

### Decision 3: Pure TypeScript helper architecture for unit testability

- **Types / Interfaces**:
  - `ViewportSpec`: `{ name: "mobile" | "tablet" | "desktop"; width: number; height: number }`
  - `WcagAuditOptions`: `{ scope?: string; fullPage?: boolean; exclude?: string[]; label?: string }`
  - `AxeViolationLike`: `{ id: string; impact?: string | null; nodes: Array<{ html: string; failureSummary?: string }> }`
  - `ErrorCollector`: `{ errors: string[]; assertZeroErrors: (label?: string) => void; detach: () => void }`
  - `DesignCheckFailure`: `{ viewport: string; check: string; message: string }`
  - `DesignCheckReport`: `{ passed: boolean; failures: DesignCheckFailure[] }`
  - `DesignCheckCliOptions`: `{ url: string; scope: string; fullPage: boolean; screenshotsDir?: string; executablePath?: string; loginEmail?: string; loginPassword?: string; viewports: ViewportSpec[]; help: boolean }`
  - `TokenSyncResult`: `{ skipped: boolean; missingImports: string[]; missingInTheme: string[]; missingFontFiles: string[]; versionMismatch?: string }`
- **Pure functions exported for Vitest** (no browser needed to unit-test logic):
  - `resolveAuditScope(params)` and `formatAxeViolations(violations, label)` in `tests/e2e/helpers/designSystemChecks.ts`
  - `parseDesignCheckArgs(argv)` in `scripts/check-design-a11y.ts`
  - `stripComments(source)` and `findComponentViolations(source)` in `tests/unit/design-system/components/imports.test.ts`
  - `validateTokenSync(repoRoot)` in `tests/unit/design-system/tokenSync.test.ts`

### Decision 4: Graceful branch independence in `tokenSync.test.ts`

- **Rationale**: Because this branch is cut from `dev` independently of `feature/integrate-delta-design`, `_docs/design/tokens.css` may not exist until both PRs merge. `validateTokenSync(repoRoot)` accepts any `repoRoot`, so unit tests can thoroughly verify both the pass and failure paths using temporary fixture directories in Vitest, AND run against `process.cwd()` whenever `_docs/design/tokens.css` exists on disk.

### Decision 5: Coexistence boundary for static component guards

- **Rationale**: Existing `app/design-system/components/` primitives (`Table`, `Link`, `Select`, etc.) currently use 4 legacy-parity `--color-dts-*` tokens (`--color-dts-action`, `--color-dts-table-border`, `--color-dts-table-header-bg`). Blocking `tokens.css` primitive variables (`--color-(neutral|warm|accent|green|amber|red)-*`) while permitting temporary `--color-dts-*` tokens keeps all existing tests green while preventing primitive token leaks.

## Risks / Trade-offs

- **[Risk] Comment em-dashes triggering false positives in `imports.test.ts`** → **Mitigation**: Strip single-line (`// ...`) and multi-line (`/* ... */`) comments before checking for em-dashes (`—`) in component source code so developer comments explaining WHY can freely use punctuation while visible JSX/string copy cannot.
- **[Risk] Playwright Chromium binary absent in some minimal CI/local environments** → **Mitigation**: Keep `yarn test:design` (and `.github/workflows/design-system-check.yml`) purely Vitest-based (zero browser/DB dependency), while `yarn design:check` supports `--executable-path` / `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` in addition to Playwright's bundled browser during Gate 9 and local/E2E verification.
- **[Risk] Target-size check (`>= 24px`) false positives on inline prose links or React Aria hidden internals** → **Mitigation**: Follow WCAG 2.2 SC 2.5.8 inline exception by skipping `<a>` elements whose computed `display === "inline"` inside text blocks (`p`, `li`, `dd`, `blockquote`), and skip `aria-hidden="true"` / `sr-only` controls (such as React Aria `HiddenSelect` and `DismissButton`).
