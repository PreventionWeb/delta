# Gate 9 report: ca-he-error-boundary (roadmap 6b)

## Pins and classification

| Item                 | Value                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| ui-classification    | `legacy-exempt` (OD-1): HE keeps legacy styling until the HE UI upgrade iteration           |
| design-system        | `unisdr/delta-design` `v0.7.2` @ `a86cc3a62378871e93cbfa14aa69740201b8c556` (OD-9)          |
| feature-prototype    | `not-required` (OD-6): no prototype covers HE or an error state; legacy HE is the reference |
| Parity reference     | Legacy root boundary (`app/root.tsx` `ErrorBoundary`) and the other he-preview pages        |
| Components used      | `~/design-system/components/Button`, `BackLink` (`components/Link`), `lucide-react` icon    |
| Not used / unchanged | `app/design-system/ui/`, `AccessManagementPage`, `scripts/check-design-system.ts`           |

## Commands run

- `yarn check:design-system --verify-spec --change ca-he-error-boundary --base origin/dev`:
  `PASS: Gate 9a design-system and spec verification passed.` (token scans skipped for
  legacy-exempt by the checker).
- Round 2 (2026-11-24, `.env.playwright` as-is): `npx playwright test
tests/e2e/hazardous-events/he-preview-error-boundary.spec.ts tests/e2e/hazardous-events/he-preview.spec.ts --retries=1`:
  19 passed, 1 failed. The new spec passes in full, including the strict axe test with the back
  link included. The one failure is `he-preview.spec.ts` "list page renders the seeded events",
  which also fails on the base (dfd47b8c). Round 1 had 13 passed and 1 failed (axe, 9b-1).
- Detail page re-check (temporary spec, deleted after the run): axe on the detail page's back link
  has no violations; the link keeps its position, outline and size (204.6 x 37.9 px); only the
  shade changes (`he-preview-detail-backlink--default--desktop.png`).
- Screenshots: `capturePrototypeStateScreenshots`, desktop (1280) and mobile (375), into
  `test-results/gate-9/ca-he-error-boundary/` (not committed):
  `he-preview-not-found-en--error--{desktop,mobile}.png`,
  `he-preview-not-found-fr--error--{desktop,mobile}.png`,
  `he-preview-unexpected-en--error--{desktop,mobile}.png`.

## Gate 9a: checks that still apply to legacy-exempt code

| Check                                  | Result | Evidence                                                                                         |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| No PrimeReact / PrimeIcons imports     | Pass   | Boundary imports only `react`, `react-router`, `react-i18next`, `lucide-react`, HE/DS components |
| Lucide icons only                      | Pass   | `TriangleAlert`, `aria-hidden="true"`, sized by `size-5` class                                   |
| Accessible names on icon-only controls | Pass   | No icon-only controls; copy button and back link have visible text names                         |
| No em dashes in new copy               | Pass   | `errorBoundaryLocales.test.ts` asserts none in EN/FR `error.*`                                   |
| Sentence-case new copy                 | Pass   | All `error.*` titles/buttons sentence case; `detail.back_to_list` kept for parity                |
| No new hex / arbitrary px              | Pass   | Tailwind utilities and existing `dts-*` classes only                                             |

## Gate 9b: accessibility and keyboard (WCAG 2.2 AA)

| Check                                                                       | Result                                               | Evidence                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| axe (`wcag2a/2aa/21a/21aa/22aa`), not-found EN/FR, malformed id, unexpected | Pass                                                 | Round 2: 9b-1 resolved by B1; strict test, back link included                            |
| Target size >= 24 x 24                                                      | Pass                                                 | `assertTargetSizesAndLabels` on `main` for the three Response states                     |
| Keyboard: Tab to copy, Enter announces, Tab to back link                    | Pass                                                 | `verifyKeyboardSequence`; live region reads "Error reference copied"                     |
| Focus not obscured                                                          | Pass                                                 | `assertFocusNotObscured` runs after every keyboard step (obscuration only)               |
| Focus visible                                                               | Known limitation (back link) / Partial (copy button) | 9b-2, user-approved deferral DEF-062; no test asserts a visible ring                     |
| Heading structure (h1 page title, h2 error title)                           | Pass                                                 | DOM test and E2E                                                                         |
| Status message (4.1.3)                                                      | Pass                                                 | `role="status"` polite region, sibling of `role="alert"`                                 |
| No horizontal scroll at 320 px, trace id wraps                              | Pass                                                 | `assertNoHorizontalOverflow`; copy button and back link fully in viewport                |
| No hydration / runtime errors                                               | Pass                                                 | Only the document's own 404/500 resource message is logged (not-found EN/FR, unexpected) |

**Finding 9b-1 (resolved in round 2, B1):** `color-contrast` (serious) on the existing legacy
`BackLink` (`text-blue-500`, `#2b7fff` on white = 3.76:1; AA needs 4.5:1 for its 12.25 px normal
text; legacy's PrimeReact outlined back button is about 3.68:1, so legacy fails too).
The same component and classes are used by the he-preview detail page, and `BackLink.test.tsx`
pins its exact class list for legacy parity, so fixing it changes a shared, parity-pinned
component outside this change's spec. Not fixed; no a11y exception recorded (an exception needs
an issue id, owner and date from the human).

**Finding 9b-2 (deferred by the user as DEF-062, from the Gate 9c audit):** the back link shows no
focus indicator. `app/styles/all.css` sets `*:focus-visible { outline: 2px solid var(--focus-ring) }`,
but `public/assets/themes/lara-light-blue/theme.css` (loaded later) redefines `--focus-ring` as a
box-shadow value, so the outline is invalid and computes to `none`. Same shared `BackLink` and
global theme as the detail page. The copy button (`.dts-button--outline[data-focus-visible]`)
has a visible but low-contrast ring (Partial). Not fixed (shared/global CSS, outside this spec).

## Gate 9c: legacy parity, ground-truth checklist (design.md)

| Item                                                                                 | Result                  | Notes                                                                                               |
| ------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- |
| Page header `MainContainer` "Hazardous events" (same as list/detail)                 | Pass                    | `dts-page-header` band identical to the list/detail pages                                           |
| Order: icon + title (h2) → body → trace row → back link                              | Pass vs design.md       | Screenshots. Back link last per design.md, while the detail page puts it first (finding 9c-4)       |
| Copy per kind (EN, FR) as in the spec table                                          | Pass                    | Locale test pins every key; DOM test per status; E2E EN/FR                                          |
| Trace reference: label, mono value, "Copy error reference", "Error reference copied" | Pass                    | `font-mono` (IBM Plex Mono), `break-all`; shown only when a traceId exists                          |
| Back affordance "Back to Hazardous events" to the list                               | Pass                    | Existing `BackLink`, same as the detail page; FR `/fr/he-preview`                                   |
| Never shown: SQL, stack, `error.message`, `details`, status as title                 | Pass                    | DOM + E2E assertions ("Failed query", "[object Object]", server message, id)                        |
| States: one per kind, no empty/loading                                               | Pass                    |                                                                                                     |
| Emphasis: title is the only bold element                                             | Pass                    | Title `text-xl font-bold` (700, 17.5 px); button `dts-button` 600; body 400 (fixed after the audit) |
| No support-contact line (OD-5b)                                                      | Pass                    | DOM test                                                                                            |
| Inside the app layout (site header/nav kept), no "Return to Home"                    | Pass                    | E2E                                                                                                 |
| Error styling vs legacy                                                              | Approved deviation (C1) | Finding 9c-1, approved 2026-11-24                                                                   |
| Icon 16/20 px                                                                        | Approved deviation (C2) | `size-5` = 17.5 px at the 14 px root (finding 9c-3), approved 2026-11-24                            |
| States visually evidenced                                                            | Partial                 | not_found (EN/FR) and unexpected captured; forbidden/invalid_request/conflict DOM-tested only       |

## Approved deviations (design.md "Documented deviations")

- Renders inside the app layout instead of the root page; no "Return to Home"; missing id is 404
  (legacy 500); Lucide icon instead of PrimeIcons; legacy styling by agreement (OD-1).

## Gate 9c audit (fresh `visual-parity-reviewer` subagent)

The audit confirmed copy, trace row, never-shown items, OD-5b, heading structure, tab order and
the README, and raised these (fixed items marked):

- **9c-1 (approved deviation C1, 2026-11-24):** the boundary uses the legacy `dts-alert dts-alert--error`
  panel (`style-dts.css`), not the root page's white card with a red icon. It is a real legacy
  error pattern (`app/frontend/components/ErrorBoundary.tsx`, `Messages.tsx`, `ErrorMessage.tsx`)
  but no he-preview page uses it, and design.md's documented deviations do not list it. Its icon
  tile glyph (`#f5ecf3` on `#d6b3d0`) is about 1.6:1; decorative and `aria-hidden`, so not a
  1.4.11 failure, but nearly invisible.
- **9c-2 (fixed):** the h2 rendered smaller than the body (`text-lg` 15.75 px vs `dts-body-text`
  15.96 px) and shared the button's 600 weight. Now `text-xl font-bold`.
- **9c-3 (approved deviation C2, 2026-11-24):** icon is 17.5 px, not 16/20 px; no non-arbitrary Tailwind size hits
  either at the 14 px root.
- **9c-4 (approved deviation C3, 2026-11-24):** back link is last (as design.md's Order item says); the detail
  page and legacy view put it first.
- **9c-5 (fixed):** unexpected-state screenshots were captured before hydration (collapsed header);
  now captured after `networkidle`. The unexpected state now also asserts no runtime errors.
- **9c-6 (informational):** on the picker the boundary shows "Hazardous events", not the picker's
  own title; this matches the spec ("the Hazardous Events page title").
- Unverified: screen-reader double announcement of `role="alert"` on hydration (design.md Risks)
  has no recorded manual AT check.

## Round 2 resolution (user, 2026-11-24)

- 9b-1 resolved (B1): `BackLink` text and border use `--color-dts-action` (`#106cb8` on white;
  axe passes). Legacy's own back button fails contrast too, so this is an approved deviation from
  legacy, recorded in design.md. Applies to the detail page and the error boundary; the new/edit
  breadcrumb already used the token. Each page keeps its own layout.
- 9b-2 deferred (B2) as DEF-062: the PrimeReact theme overrides `--focus-ring` app-wide. Known
  limitation; no test asserts a visible ring on the back link.
- 9c-1, 9c-3, 9c-4 approved as deviations C1-C3.
- Copy (E1, E2): a repeat copy re-announces "Error reference copied"; the 403 body is now
  "You do not have permission to do this." / "Vous n'avez pas l'autorisation d'effectuer cette
  action."

## Open items

- None for Gate 9. DEF-062 tracks the focus ring.
