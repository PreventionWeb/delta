---
name: anti-pattern-check
description:
  "Quality gate checklist of known anti-patterns and code standards for DELTA.
  Reference during code review, the Refactor phase of TDD, or when implementing any change.
  Covers project-specific known bugs, DELTA conventions, and general code quality rules."
---

# Anti-Pattern Check — DELTA Resilience

Run this checklist during the Refactor phase of TDD and before any PR is raised.
A finding means: stop, fix, re-run tests, re-check.

---

## P0 Known Anti-Patterns — Never Reproduce

These are confirmed bugs in the codebase. Do not copy these patterns, extend these functions,
or use them as implementation templates.

| ID       | Anti-Pattern                                    | Where it exists                  | Rule                                                                           |
| -------- | ----------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| AP-P0-2  | Missing `await` on Drizzle delete/insert/update | `common.ts deleteById`           | Every Drizzle mutation MUST be awaited                                         |
| AP-P0-7  | Swallowing errors from sub-calls                | `human_effects.ts deleteAllData` | Errors from called functions MUST be propagated or rethrown                    |
| AP-P0-9  | Sentinel string for control flow                | `common.ts handleTransaction`    | Use typed `Error` subclasses, never magic strings                              |
| AP-P0-10 | Type export in wrong schema file                | `hipHazardTable.ts` (fixed)      | Export `$inferSelect`/`$inferInsert` only from the file that defines the table |
| AP-P0-12 | Logging env var values at startup               | `env.ts` (fixed)                 | Never log env var values; log var names only if needed                         |
| AP-P0-14 | Stripping meaningful characters from input      | `security.ts sanitizeInput`      | Never remove apostrophes, diacritics, or other valid user text                 |

---

## Auth & Security Checks

- [ ] Every loader uses `authLoaderWithPerm` or `authLoaderApi` — **never `authLoaderApiDocs`**
      (P1-22: `authLoaderApiDocs` skips the tenant check on API key auth path)
- [ ] Every action uses `authActionWithPerm` or `authActionApi`
- [ ] No user input used in raw SQL strings (use Drizzle parameterised queries always)
- [ ] No secrets or env var values logged (names only if necessary)

---

## Multi-Tenancy Checks

- [ ] Every query that touches tenant data filters by `countryAccountsId`
- [ ] No cross-tenant data access — a user's `countryAccountsId` must match the record's
- [ ] `countryAccountsId` is always sourced from the authenticated session, never from user input

---

## Database Checks

- [ ] Every Drizzle mutation (`insert`, `update`, `delete`) is `await`ed
- [ ] No `drizzle-kit push` — migrations run via `yarn dbsync` (drizzle-kit migrate) only
- [ ] New columns also updated in `tests/integration/db/testSchema/` (until P1-42 resolved)
- [ ] Primary keys use `ourRandomUUID()`, foreign key references use `uuid` type
- [ ] `SelectX` and `InsertX` types exported from the file that defines the table, nowhere else
- [ ] FK columns are not indexed by default — only when a real query or delete-check path needs it
- [ ] New timestamp columns use `{ withTimezone: true }` inline, never the `createdUpdatedTimestamps` helper (ADR-002)

---

## Error Handling Checks

- [ ] No swallowed errors — every `catch` either rethrows, wraps in a domain error, or returns
      a typed error result; never silently discards
- [ ] No sentinel strings for control flow — use `class DomainError extends Error {}`
- [ ] Async functions that can fail return a typed result or throw; never return `undefined` on error
- [ ] When a repository/adapter catches one specific driver error code (e.g. Postgres `23505`)
      and maps it to a domain error, check for other realistic sibling codes at the same call site
      (e.g. `23503` FK violation, `22P02` invalid input) — map those too, don't leave them to leak
      as raw driver exceptions just because only one case was in focus

---

## NestJS Checks

These apply to any file that touches NestJS bootstrap, providers, modules, or tests.

- [ ] **Fatal bootstrap errors must halt the process** — any fire-and-forget call to an
      `async` init function on a server entry point (e.g. `initServer()` in `entry.server.tsx`)
      MUST use `.catch((err) => { console.error(err); process.exit(1); })`.
      `.catch(console.error)` alone is forbidden — it lets the app continue with no DB and no
      DI container, producing silent failures on every subsequent request.

- [ ] **Singleton bootstrap Promise must reset on failure** — any module-level
      `let bootstrapPromise: Promise<T> | undefined` guard MUST reset to `undefined` inside
      a `catch` block before re-throwing. If it is not reset, the first transient failure makes
      the Promise permanently rejected and all subsequent retry attempts fail instantly without
      ever calling `NestFactory` again.

- [ ] **NestJS TestingModule must be closed after each test** — every
      `Test.createTestingModule(...).compile()` call MUST be paired with `await module.close()`
      in an `afterEach` hook. Unclosed modules leak NestJS lifecycle resources (timers, connections,
      event emitters). Use a `const modulesToClose: TestingModule[] = []` array + `afterEach` to
      handle tests that create multiple modules (e.g. concurrent-resolution tests).

- [ ] **NestJS v11 injection tokens are not constructable** — `new InjectionToken<T>(...)` is
      Angular syntax and throws at runtime in NestJS v11 (`InjectionToken is not a constructor`).
      Use `Symbol("TOKEN_NAME") as InjectionToken<T>` instead.

---

## Code Quality Checks

- [ ] No `any` types without an explicit justification comment
- [ ] No non-null assertions (`!`) without justification
- [ ] Functions do one thing (Single Responsibility) — if it needs a paragraph to describe, split it
- [ ] No magic numbers or magic strings — name constants
- [ ] `yarn tsc` passes with zero errors
- [ ] `yarn format:check` passes (Prettier: tabs, 80-char width, trailing commas)

---

## Test Quality Checks

- [ ] New tests are under `tests/` using Vitest — not `app/backend.server/*_test.ts` (orphaned)
- [ ] Tests cover both happy path and failure paths
- [ ] Each test describes one behaviour (`it("throws when row does not exist", ...)`)
- [ ] No tests that pass immediately without an implementation (not a real Red-phase test)
- [ ] PGlite used for DB tests where possible — no mocking the database unless unavoidable

---

## DELTA-Specific Convention Checks

- [ ] New server-only files use `.server.ts(x)` suffix
- [ ] Internal links use `LangLink`, not `<a href>`
- [ ] New user-facing strings use `ctx.t({ code, msg })` and `yarn i18n:extractor` has been run
- [ ] New env vars added to `example.env` with a descriptive comment
- [ ] Branch targets `dev`, not `main`

---

## UI & DELTA Design System Anti-Patterns

Apply these checks to any change touching `app/domains/*/presentation/`, `app/routes/`,
`app/components/`, `app/design-system/`, or CSS/styles (see `.github/skills/design-system-check/SKILL.md`
for the full Gate 9 verification checklist):

- [ ] **No raw colours or prohibited primitive variables** — never use hardcoded hex (`#004f91`,
      `#fff`), `rgb()`, `hsl()`, or primitive `--color-*` tokens directly in `react-aria`
      classified feature/component code; use semantic tokens from `unisdr/delta-design` (`tokens.css`)
- [ ] **No new PrimeReact or PrimeIcons in `react-aria` classified screens** — never import from
      `primereact` or `primeicons` in new or migrated React Aria routes/components
- [ ] **No sibling margins for layout spacing** — use `gap` on the flex or grid parent instead of
      sibling `margin-top`/`margin-bottom`/`margin-left`/`margin-right`
- [ ] **No inappropriate fully rounded standard buttons** — never apply `rounded-full` /
      `radius-full` to standard action buttons
- [ ] **No inaccessible icon-only controls** — every icon-only button or link MUST have an explicit
      accessible name (`aria-label` or `aria-labelledby`), and target size MUST be at least
      `24 x 24` CSS px (`32 x 32` CSS px preferred)
- [ ] **No hidden or obscured keyboard focus** — never suppress `:focus-visible` /
      `[data-focus-visible]` outlines without a high-contrast replacement, and never allow sticky
      headers, dialogs, toasts, or overlays to obscure the focused element
- [ ] **No silent error banners or unannounced validation errors** — error banners and immediate
      validation summaries MUST use `role="alert"` or an appropriate live region, and never rely on
      colour alone
- [ ] **No charts without text summaries or tabular alternatives** — every Recharts visualization
      MUST provide an accessible name, text summary, `role="img"` where appropriate, and a "Show as
      table" or equivalent data alternative
- [ ] **No em dashes or prototype placeholder copy** — never include `—` (`\u2014`) in UI copy, and
      never ship prototype mock labels or fabricated placeholder data
- [ ] **No undocumented divergence from pinned design-system or prototype references** — any
      material deviation from the pinned `unisdr/delta-design` or `unisdr/delta-feature-prototypes`
      commit SHA MUST be documented in `design.md` and `gate-9-report.md` and approved by a human

---

## Design System & Accessibility Checks

Apply to any UI change in `app/design-system/`, `app/domains/*/presentation/`, or `app/routes/` (see `_docs/design/DESIGN.md` and `.github/skills/design-system-check/SKILL.md`).

- [ ] **Semantic tokens only** — no hardcoded hex colours (`#...`) or `tokens.css` primitives (`--color-(neutral|warm|accent|green|amber|red)-\d+`) in components; use semantic tokens (`--bg`, `--surface`, `--fg`, `--accent`, `--crit`, `--warn`, `--good`, etc.)
- [ ] **Lucide icons only** — icons come from `lucide-react`; no raw `<svg>` icons, PrimeIcons, or alternate icon libraries
- [ ] **Design-system boundary respected** — files in `app/design-system/` do not import `primereact` or `app/domains/*`
- [ ] **Spacing and motion rules** — stick to the 4px spacing scale and use `gap` over sibling margins; do not invent bespoke animation durations or easings in feature code
- [ ] **Contrast and non-colour signals** — `--fg-3` is reserved for decorative/disabled text only; colour is never the sole status signal (pair with text or icon)
- [ ] **Accessible targets and labels** — icon-only buttons carry `aria-label` or visible text; interactive targets meet WCAG 2.2 AA minimum size (`>= 24x24px` or compliant spacing)
- [ ] **Copy conventions** — UK English with `"organization"`, sentence case for headings and buttons, and no em-dashes (`—`) in UI copy
