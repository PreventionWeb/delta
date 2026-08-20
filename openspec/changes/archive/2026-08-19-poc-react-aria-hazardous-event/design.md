## Context

DELTA's component library, PrimeReact, has had its repository archived and its usage policy
changed. The team has committed to migrating to React Aria Components (RAC) + Tailwind (Tailwind
v4 is already installed and configured at `app/styles/all.css`; `react-aria-components` is not yet
a dependency). Before committing the real Hazardous Event Clean Architecture domain migration to
this stack, we need a disposable spike proving RAC + Tailwind can reproduce a real, complex,
production page.

**Actual current-state finding (corrects an assumption in earlier framing of this intent):** the
production Hazardous Event **list** page (`app/frontend/events/hazardeventlist.tsx`) is already
almost entirely hand-rolled `dts-*` CSS on raw HTML (`<table>`, `<td>`, etc.) — not PrimeReact. Its
entire component-tree PrimeReact inventory is a single `Tooltip` import. Its filter bar
(`hazardevent-filters.tsx`), pagination (`pagination/view.tsx`), legend (`ListLegend.tsx`), and
action links (`data-collection/ActionLinks.tsx`) all have zero PrimeReact imports too. This means
the list page mostly tests "Tailwind vs. legacy `dts-*` CSS," not "React Aria vs. PrimeReact." The
**create** page (`app/routes/$lang+/_authenticated+/hazardous-event+/new.tsx`, rendering
`HazardousEventForm` in `app/frontend/events/hazardeventform.tsx`) is where the real PrimeReact
surface lives — see the inventory in Decisions below — so it carries most of this POC's actual
evaluation value.

The create page's field set comes from `fieldsDefCommon`/`fieldsDef` in `hazardeventform.tsx`:
`hipHazardId`/`hipClusterId`/`hipTypeId` (hazard classification), `parent` (caused-by), approval
status, `nationalSpecification`, `startDate`, `endDate`, `description`, `chainsExplanation`,
`magnitude`, `spatialFootprint`, `attachments`, `recordOriginator`, `hazardousEventStatus`,
`dataSource`, plus hidden `tempValidatorUserIds`/`tempAction` fields used by the save/submit modal.
`edit.$id.tsx` renders the identical field set (pre-filled), confirming this is the full field
surface to account for.

## Goals / Non-Goals

**Goals:**

- Prove or disprove that React Aria Components + Tailwind can reproduce the Hazardous Event list
  page's visual appearance and behavior.
- Prove or disprove that React Aria Components + Tailwind can support a genuinely complex form —
  restructured as a 3+ step stepper — including the widgets PrimeReact currently provides
  (dialogs/modals, multi-select, checkboxes) at equivalent visual fidelity.
- Produce a clear, evidence-backed recommendation (proceed / abandon / proceed-with-caveats) to
  feed into the real Hazardous Event Clean Architecture migration and into
  `_docs/refactoring-plan/design-system-unification-roadmap.md`.
- Keep the spike fully isolated from production routes, nav, and the `app/domains/*` Clean
  Architecture work.

**Non-Goals:**

- No Clean Architecture domain migration (no `app/domains/hazardous-event/*` work).
- No change to any production Hazardous Event route, component, or the `fieldsDef` Form-CSV-API
  contract.
- No requirement that the POC be mergeable, production-ready, or fully feature-complete — an
  incomplete or partially-abandoned POC is an acceptable outcome per the proposal.
- No new detail/view page — the POC covers list + create only, per scope.
- No design-system token extraction (that is Pass 1 of the separate, not-yet-scheduled
  `design-system-unification-roadmap.md` initiative). This POC's findings feed that roadmap; it
  does not implement it.

## Decisions

### Decision 1 — Route naming and isolation

New route files, nested under a `poc-react-aria+` pathless-ish path segment (a real URL segment,
unlike `_public+`/`_authenticated+`, so it's a visible, unmistakable marker in the URL bar) inside
the existing `_public+` / `_authenticated+` layout groups — preserving today's auth boundary
exactly:

- `app/routes/$lang+/_public+/poc-react-aria+/hazardous-event+/_index.tsx`
  → `/{lang}/poc-react-aria/hazardous-event` (list, public)
- `app/routes/$lang+/_authenticated+/poc-react-aria+/hazardous-event+/new.tsx`
  → `/{lang}/poc-react-aria/hazardous-event/new` (create, authenticated)

Rationale: `remix-flat-routes` (`app/routes.ts`) treats `+`-suffixed folders as route segments;
`_public+`/`_authenticated+` are the existing pathless layout groups that apply `requireUser`
(authenticated) at the layout level. Nesting under these exactly mirrors the production auth
wiring with zero new auth code paths. `poc-react-aria+` as a real segment (not underscore-prefixed)
makes the spike's URLs self-evidently non-production and greppable/removable as a unit
(`rm -rf app/routes/$lang+/*/poc-react-aria+` cleanly deletes the entire spike).

**Isolation is achieved by omission, not by a flag**: `app/components/RegularMenuBar.tsx` is the
single source of truth for nav links in this app (confirmed by grep — it is the only file
referencing `hazardous-event` outside `app/frontend`/`app/backend.server`). The POC routes are
reachable only by typing the URL directly, because no entry is added there. Do not add one.

Alternatives considered: reusing the exact placeholder name `he-react-aria-poc` from the intent —
rejected only because it doesn't nest per-page the way the rest of the route tree does
(`hazardous-event+/_index.tsx`, `hazardous-event+/new.tsx`); the `poc-react-aria+/hazardous-event+/`
nesting keeps that same shape and reads clearly as "the React Aria POC, for Hazardous Event."

### Decision 2 — Auth wiring: replicate `new.tsx`'s actual pattern, not `authLoaderWithPerm`

The production `new.tsx` loader is **not** wrapped in `authLoaderWithPerm`. It is a bare
`export async function loader` that explicitly calls, in order: `requireUser({ request, params })`
→ `getCountryAccountsIdFromSession(request)` (redirect to `/select-instance` if missing) →
`hasPermission(request, "EditData")` (403 if not permitted). The code comment there explains why:
React Router v7 runs all matched route loaders in parallel (`Promise.all`), so the
`_authenticated+` parent layout's own `requireUser` call does **not** run before this loader —
each loader must independently guarantee the redirect. The action uses `authActionWithPerm` as
normal.

The POC create loader/action **must replicate this exact pattern**, including constructing
`argsWithSession = { ...loaderArgs, userSession }` before calling
`authLoaderGetUserForFrontend(argsWithSession)` (that helper reads `args.userSession`, injected
here because the old `authLoaderWithPerm` wrapper isn't in play). Using `authLoaderWithPerm` on the
POC loader instead would still enforce auth correctly in isolation, but would silently diverge from
the verified production pattern this spike is supposed to be evaluating a replacement UI for —
if the real migration later copies the POC's auth code instead of production's, that regression
would be easy to miss. Copy `new.tsx`'s loader logic near-verbatim; only the rendered UI changes.

The POC list loader may reuse `authLoaderPublicOrWithPerm("ViewData", ...)` exactly as
`_index.tsx` does — no special-casing needed there.

**Confirmed still in force after Decision 8 (data mocking):** the data-mocking decision only
changes what happens _after_ these auth calls return successfully. `requireUser`,
`getCountryAccountsIdFromSession`, `hasPermission(request, "EditData")`,
`authLoaderPublicOrWithPerm("ViewData", ...)`, and `authActionWithPerm("EditData", ...)` all still
run exactly as described above, against real session/auth state — none of them are stubbed,
mocked, or bypassed. Only the DB-backed _content_ calls that used to follow those checks
(`hazardousEventsLoader`, `dataForHazardPicker`, the validator-role queries, the `divisionTable`
query, and the final `hazardousEventCreate` save) are replaced with static fixtures or a simulated
result (see Decision 8). This POC is not becoming an unauthenticated or unpermissioned demo.

### Decision 3 — Per-component PrimeReact inventory and disposition

This is the load-bearing decision: what gets rebuilt in React Aria vs. reused unchanged vs.
stubbed. "Reuse the whole page unchanged" would prove nothing; "rebuild everything including
unrelated map/upload internals" is far bigger than a spike. Verified by direct import inspection.

**List page tree:**

| Component                                                  | PrimeReact today?            | POC disposition                                                                                          | Why                                                                                                                             |
| ---------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Table/rows (`hazardeventlist.tsx` core)                    | No (raw `<table>` + `dts-*`) | **Rebuild** in RAC `Table`/`Row`/`Cell` + Tailwind                                                       | Primary evaluation surface for the list page                                                                                    |
| Approval-status `Tooltip`                                  | Yes (`primereact/tooltip`)   | **Rebuild** using RAC `Tooltip`/`TooltipTrigger`                                                         | The only actual PrimeReact swap on this page — small but real                                                                   |
| `HazardousEventFilters`                                    | No                           | **Reuse as-is** (stretch: rebuild `Select`/date inputs in RAC if time permits)                           | Already non-PrimeReact; low priority, optional stretch only                                                                     |
| `Pagination` (`pagination/view.tsx`)                       | No                           | **Reuse as-is**                                                                                          | Already non-PrimeReact, purely presentational                                                                                   |
| `ListLegend`                                               | No                           | **Reuse as-is**                                                                                          | Static, non-PrimeReact                                                                                                          |
| `DataCollectionActionLinks`                                | No                           | **Superseded — see the revised note below the table.** Originally: reuse as-is, not exercised.           | Originally already non-PrimeReact and out of scope; now in scope, but not via this real component — see below                   |
| `MainContainer` (layout wrapper)                           | No                           | **Reuse as-is**                                                                                          | Shared app chrome, not a component-library concern                                                                              |
| `HazardEventHeader` (`EventCounter.tsx`)                   | No                           | **Reuse as-is**                                                                                          | Not a component-library concern                                                                                                 |
| `DataMainLinks` "Add new event" button (`data_screen.tsx`) | Yes (`primereact/button`)    | **Do not import `DataMainLinks`** — hand-roll the single "Add new event" link with a RAC `Button`/`Link` | Importing `DataMainLinks` would silently reintroduce PrimeReact into an otherwise-clean comparison; trivial to replace directly |

**Superseded decision, kept for history:** the POC list page was originally built as production's
**public** view (`isPublic: true`, matching the real anonymous-visitor default) — reasoning that
the action-links column and the PrimeReact-in-`DataMainLinks` button only render for the
authenticated variant, so building the public variant both matched the intent's stated auth
boundary and sidestepped a decision on that button. A follow-on implementation note then had to
partially walk that back: the approval-status `Tooltip` (2.3) has no attachment point in the true
public variant, so the built page always rendered the approval-status column + `ListLegend` and
the "Add new event" link regardless of `isPublic` anyway — landing on a deliberate 5-column table
(hazard type, approval status, UUID, created, updated), missing Actions and "Showing X of Y"
relative to production's 6-column authenticated view. Task 2.6's comparison was then run against
that authenticated view (the only one reachable in this environment, since local
`instanceSystemSettings.approvedRecordsArePublic` is `false`), with the gap to Actions/"Showing X
of Y" recorded as a known, intentional deviation.

**Revised decision (this amendment):** stop distinguishing public vs. authenticated rendering for
this POC entirely. The `approvedRecordsArePublic` constraint that made the prior compromise
necessary hasn't changed — the true anonymous 4-column view still isn't reachable in this
environment — but rather than keep reasoning about a view this POC can never load and compare
against, the team decided the reachable authenticated view _is_ the comparison target, so the POC
should simply always render it in full: hazard type, record status (dot + rebuilt `Tooltip`),
UUID, created, updated, and **Actions**, plus the "Showing X of Y hazardous event(s)" summary text
— none of it gated on `isPublic`. This turns 2.6's comparison into an apples-to-apples check
against what is actually on screen in this environment, rather than a "5 of 6 columns, one
documented gap" comparison. `isPublic` remains present in the fixture/loader return shape only
because it's part of `hazardousEventsLoader`'s real return type (Decision 8) — the POC's own
rendering no longer branches on it. This also resolves the "authenticated list view" stretch item
noted in Open Questions below: it is no longer optional, it is now the only rendering mode.

**`DataCollectionActionLinks` disposition, revised:** the per-component table above originally
listed this as "reuse as-is, not exercised." That's superseded: Actions are now exercised, but not
via the real component. Hand-roll new inert action icon buttons in RAC (`Button` + a shared
`Modal`/`Dialog`), reusing production's exact SVG icon sprites for visual parity — verified in
`app/frontend/components/data-collection/ActionLinks.tsx`: `<svg><use
href="/assets/icons/edit.svg#edit" /></svg>`, `.../eye-show-password.svg#eye-show`,
`.../trash-alt.svg#delete` — but not the real component's navigation
(`LangLink` to `${route}/edit/${id}` and `${route}/${id}`) or its delete flow
(`app/frontend/components/delete-dialog.tsx`'s PrimeReact `ConfirmDialog`/`Button`/`Toast`
cluster, wired through `HazardousEventDeleteButton`). Reason: the fixture's rows use fake,
non-DB-backed IDs (Decision 8) — real edit/view links or a real delete submit against those IDs
would 404 or error against nonexistent data, which is worse for a visual-parity spike than a
clearly-labeled mock.

Chosen mocked behavior: all three icon buttons (edit/view/delete) open one shared RAC
`Modal`/`Dialog` component with placeholder copy (e.g. "This action isn't wired up in this POC —
mocked data only"), rather than being real links or `href="#"`. A `#` link gives no feedback on
click; a modal does, at roughly the same build cost, and it's one more RAC `Modal` proof point
alongside the discard dialog (3.8) and `SaveSubmitDialog` (3.9) planned for the create page. This
also replaces `delete-dialog.tsx`'s PrimeReact `ConfirmDialog`/`Button`/`Toast` cluster with the
RAC modal for the delete action specifically — a small additional PrimeReact-replacement proof
point worth recording in the inventory, on top of the two the list page already counted
(approval-status `Tooltip`, `DataMainLinks`'s button). `delete-dialog.tsx` itself is not edited:
verified it is also imported by `app/frontend/form/action_links.tsx`,
`app/routes/$lang+/disaster-record+/edit.$id.tsx`, and `app/frontend/form/view_component.tsx`, so
editing it in place would affect those domains too — same non-in-place-edit approach already used
for `SaveSubmitDialog` below. The shared placeholder modal is a new POC-local component (e.g.
co-located under this route's own `+` folder, consistent with Decision 8's fixture co-location
convention).

**Create page tree:**

| Component                                                                   | PrimeReact today?                                                                                                                                                                                                                                                                                                   | POC disposition                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field inputs (text/textarea/date/enum via `fieldsDef`)                      | No (`form/inputs.tsx` is plain HTML)                                                                                                                                                                                                                                                                                | **Hand-build** in RAC (`TextField`, `TextArea`, `DateField`, `Select`/`RadioGroup`) grouped into steps — see Decision 4                                                                                                                                         | Not a PrimeReact swap, but required to build the stepper at all; see Decision 5 on why the generic `FormView`/`Inputs` engine isn't reused                                                                                                                                                                                                                                                                                                                  |
| Discard/exit-confirmation dialog (inline in `hazardeventform.tsx`)          | Yes (`primereact/dialog`, `primereact/button`)                                                                                                                                                                                                                                                                      | **Rebuild** using RAC `Modal`/`Dialog` + `Button`                                                                                                                                                                                                               | Simple, cheap, proves basic modal parity                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SaveSubmitDialog` (save-or-submit modal, validator multi-select, checkbox) | Yes (`Dialog`, `Button`, `Checkbox`, `MultiSelect`)                                                                                                                                                                                                                                                                 | **Reimplement as a new POC-local component** (e.g. a new file under the POC route tree) using RAC `Modal`/`Dialog`, `Checkbox`, `ListBox`/`ComboBox` (multi-select) — do **not** edit `app/frontend/components/approval-workflow/SaveSubmitDialog.tsx` in place | Verified this file is also imported by `disastereventform.tsx`, `disaster-record/form.tsx`, and `DisasterEventForm.tsx` — editing it in place would change behavior for those domains too, breaking this spike's isolation. It remains the single highest-value proof point (most complex widget cluster PrimeReact provides today), just built as a standalone copy rather than an in-place edit                                                           |
| `AttachmentsFormView` (`app/frontend/attachmentsFormView.tsx`)              | **No** — verified zero PrimeReact imports; it's a thin wrapper. The actual PrimeReact widget cluster (`FileUpload`, `Dropdown`, `Dialog`, `Button`, `MultiSelect`, `RadioButton`, `InputText`, `InputTextarea`, `Message`) lives in `app/components/ContentRepeater/index.tsx`, which `AttachmentsFormView` renders | **Reuse as-is, unchanged** (like `SpatialFootprintFormView`) — do not rebuild                                                                                                                                                                                   | `ContentRepeater` is a shared, generic, multi-domain component also used by disaster-event and disaster-record (attachments, losses, damages, disruptions). Rebuilding a generic repeater/upload engine in RAC is disproportionate to a disposable single-domain spike, and any in-place change would affect those other domains. This removes attachments as a rebuild proof point — `SaveSubmitDialog` is now the spike's sole complex-widget proof point |
| `HazardPicker` (`hip/hazardpicker.tsx`)                                     | No direct import, but opens `window.open("/hazardous-event/picker")` + `postMessage` handshake                                                                                                                                                                                                                      | **Stub**: replace with an inline RAC `ComboBox`/`Select` bound to the same `hip` loader data (hazard/cluster/type lists), no popup window                                                                                                                       | The popup depends on a production route outside the isolated POC tree — reusing it would make the "isolated route tree" claim false. Flag in Risks that the real migration must separately solve the picker UX; this stub is intentionally simplified                                                                                                                                                                                                       |
| `SpatialFootprintFormView` (map/geojson widget)                             | No                                                                                                                                                                                                                                                                                                                  | **Reuse as-is, unchanged import**                                                                                                                                                                                                                               | Not a PrimeReact component; a map-widget rebuild is out of scope/expensive and orthogonal to the RAC-vs-PrimeReact question. Still exercised end-to-end for "real complex page" fidelity                                                                                                                                                                                                                                                                    |
| `Toast` (`form/input.tsx`, validation toasts)                               | Yes (`primereact/toast`)                                                                                                                                                                                                                                                                                            | **Not pulled in**                                                                                                                                                                                                                                               | Only reachable via the generic `Inputs`/`FormView` engine, which the POC does not call (Decision 5) — moot                                                                                                                                                                                                                                                                                                                                                  |
| `FormView`/`Inputs`/`formScreen` (generic rendering engine)                 | No PrimeReact directly                                                                                                                                                                                                                                                                                              | **Not reused** for rendering                                                                                                                                                                                                                                    | See Decision 5                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Decision 4 — Stepper structure and state model

Minimum 3 steps requested; propose 4, keeping the heaviest widget (spatial footprint) alone so no
single step is overloaded:

1. **Classification & linkage** — `hipHazardId`/`hipClusterId`/`hipTypeId` (via the stubbed
   picker), `parent` (caused-by, if arriving with `?parent=`), `hazardousEventStatus`,
   `nationalSpecification`.
2. **Timing & characterization** — `startDate`, `endDate`, `magnitude`, `description`,
   `chainsExplanation`.
3. **Location** — `spatialFootprint` (map widget), alone, given its size/complexity.
4. **Evidence, provenance & review** — `attachments`, `recordOriginator`, `dataSource`, ending in
   the rebuilt `SaveSubmitDialog` (save-as-draft / submit-for-validation) and discard actions.

Hidden fields (`tempValidatorUserIds`, `tempAction`) are not part of any visible step; they live in
whatever top-level state/form object accumulates values across steps.

**State model — single controlled state object, not a multi-form or hidden-DOM-node approach.**
The production form's submit path depends on one `<form id="form-new">`:
`document.getElementById("form-new")`, `.checkValidity()`, `.reportValidity()`,
`.requestSubmit()`, plus hidden inputs set by DOM id. A naive stepper built as "one big
always-mounted form with CSS `display:none` on inactive steps" hits a real trap: several fields are
`required` (`startDate`, `endDate`, `recordOriginator`, `hipHazardId`) and are spread across
different steps — a `required` field inside a hidden step makes native `reportValidity()` fail
against a non-focusable control at final submit, with no way for the user to see why.

Decision: hold all field values in a single React state object scoped to the stepper (e.g.
`useState<Partial<HazardousEventFields>>`), and render **only the active step's inputs** —
unmounting the others rather than hiding them with CSS. Values already entered persist in state
across step navigation regardless of mount state, so nothing is lost. Each step's own "Next"
button validates only that step's fields (via RAC's `isRequired`/`validate` props or an explicit
check against the state slice for that step) before advancing. On the final step, submission
serializes the full accumulated state object directly (not via native form `FormData`/
`requestSubmit()`, since not all fields are ever simultaneously mounted) to the route's action.
This sidesteps the hidden-required-field trap entirely rather than working around it after the
fact — verify this holds in the browser once built rather than trusting it on paper alone.

### Decision 5 — Do not reuse `formScreen`/`FormView`/`Inputs` for rendering

`fieldsDef` (the Form-CSV-API contract) is read for its field list, labels, `required` flags, and
enum options — reused as data, unchanged, per the proposal's "no fieldsDef impact" statement. But
the generic rendering engine built on top of it (`formScreen` → `FormView` → `Inputs`) assumes a
single always-visible form with no concept of steps; retrofitting stepper/step-gated-validation
behavior into that shared, production-critical generic engine would itself be a significant,
risky undertaking — well beyond a disposable spike, and it would risk regressing every other
domain's forms that also depend on it. The POC create page instead hand-builds its own step
markup with RAC components, reading field metadata from `fieldsDefCommon(ctx)` for labels/options
only.

### Decision 6 — Submission wiring: fully mocked, no real save (revised)

**Superseded decision, kept for history:** the original version of this decision proposed reusing
the real `hazardousEventCreate` + `handleApprovalWorkflowService` save path unchanged, reasoning
that a successful save would prove the stepper's accumulated state is complete and correctly
shaped at final submit.

**Revised decision:** once Decision 8 (below) made all reference/dropdown data
(`dataForHazardPicker`, the validator lists, division geojson) static mock fixtures instead of live
query results, reusing the real save path stopped being viable — `hazardousEventCreate` and
`handleApprovalWorkflowService` expect foreign keys (`hipHazardId`/`hipClusterId`/`hipTypeId`,
validator user IDs, division IDs) that resolve against real rows in this environment's database.
Mocked fixture IDs have no guarantee of matching real rows, so a real save would either fail
unpredictably (broken foreign key) or, worse, silently succeed against the wrong real row if a
mocked ID happened to collide with one. The user was asked directly whether to keep the real save
path now that its inputs are mocked, or mock the submit too, and **chose to fully mock submit**.

The POC create action therefore does not call `hazardousEventCreate` or
`handleApprovalWorkflowService` at all. After `authActionWithPerm`'s real permission check passes
(Decision 2 — unchanged), the action assembles the full stepper state into the same shape
`hazardousEventCreate` would have received, logs/holds that payload (e.g. `console.log` plus
returning it to the client), and returns a simulated success result. The rendered UI then shows a
success/confirmation state (e.g. "Event saved as draft" / "Submitted for validation") in place of
the production route's redirect to `/hazardous-event/{id}`, since there is no real `id` to redirect
to. This resolves the open question the original Decision 6 left about whether a stubbed action
was an acceptable downgrade — it is, and it is now the committed approach, not a fallback.

This also means the per-step validation gating is now verified against "the assembled payload is
complete and correctly shaped for the real save function's input contract," not against an actual
successful DB write — a slightly weaker but still meaningful proof point, and consistent with the
rest of this POC being presentation-layer-only.

### Decision 7 — Styling strategy: Tailwind utilities on new markup

PrimeReact's theme CSS and the legacy `style-dts.css` are both loaded globally in this app
(`app/styles/all.css`), so the POC's pages inherit them incidentally regardless of what the POC
itself imports. To keep the comparison meaningful, all newly-built markup (the table, the stepper
fields, the rebuilt dialogs) is styled with Tailwind utility classes reproducing today's visible
spacing/colors/typography — not by applying the existing `dts-*`/`mg-button` classes to RAC
primitives, which would achieve pixel parity trivially but prove nothing about Tailwind's
sufficiency. The one exception: components explicitly marked "reuse as-is" above (`Pagination`,
`ListLegend`, `SpatialFootprintFormView`, etc.) keep their existing classes since they are not
being re-implemented at all.

React Aria Components exposes interaction/selection state via `data-*` attributes (e.g.
`data-hovered`, `data-selected`, `data-focused`, `data-disabled`), which Tailwind v4's arbitrary
attribute-variant syntax (`data-[hovered]:bg-...`) can style directly without an additional plugin
in most cases. **This must be verified as the first implementation task**, before building any
real component, against this project's actual Tailwind v4 config — if plain arbitrary variants
don't work as expected here, add `tailwindcss-react-aria-components` as a further dependency at
that point rather than assuming it up front.

### Decision 8 — All page content is static mock fixture data, not live DB reads (new)

Since this POC is explicitly presentation-layer-only (per proposal.md's "Why"), every piece of data
either page _displays_ must come from static, in-memory JSON/TS fixtures — not a live query — even
though both loaders keep their real auth calls (Decision 2, confirmed above still applies
unchanged). This is a stronger constraint than the original proposal's "reuses existing read-only
loader logic... or stubs it" framing, which this decision replaces with a definitive answer.

**Fixture location:** `app/routes/$lang+/_public+/poc-react-aria+/hazardous-event+/fixtures/` and
`app/routes/$lang+/_authenticated+/poc-react-aria+/hazardous-event+/fixtures/` — a `fixtures/`
folder co-located inside each isolated route's own `+` folder, one `.ts` file per fixture concern
(e.g. `listRows.ts`, `hazardPickerData.ts`, `validatorUsers.ts`, `divisionGeoJson.ts`). Rationale:
co-locating under the POC's own isolated route tree (rather than e.g. a shared `tests/fixtures/`
location) keeps the entire spike — including its fake data — deletable as one unit via
`rm -rf app/routes/$lang+/*/poc-react-aria+`, consistent with Decision 1's isolation-by-omission
and cleanup story. Plain `.ts` modules exporting typed constants are used instead of `.json` files
so the fixtures can be typed directly against the real response shapes named below (`import type`
from the real model files), giving a compile-time check that the fixture stays shaped like the real
thing without needing a JSON-schema layer for a disposable spike.

**What each fixture contains, and the real shape it must match:**

- **List rows** (`listRows.ts`) — replaces `hazardousEventsLoader`'s return value consumed by
  `HazardousEventListPage`/`HazardEventHeader` in the list route. Must match the shape of
  `hazardousEventsLoader`'s return (`app/backend.server/handlers/events/hazardevent.ts`): an object
  with `isPublic`, `filters`, `hip`, `data: { records, pagination }` (`pagination.totalItems` is
  read directly by `HazardEventHeader`), `countryAccountsId`, `organizations`. **Revised (this amendment):** at least 25 rows are required
  in the populated variant — the original 5-10-row fixture made pagination structurally present
  (the control renders) but never actually exercised (there was only ever one page). Keep the
  existing empty-result fixture variant unchanged (still zero rows).

  `Pagination`'s page-size options are a fixed list, `[10, 20, 30, 40, 50]`
  (`app/frontend/pagination/view.tsx`), and it falls back to `10` if `pageSize` isn't one of those
  values. Getting a real, clickable second page out of 25 rows therefore needs either (a) the
  fixture's `pagination.pageSize` set to `10` (not left at `50`, which the original fixture used —
  25 rows at `pageSize: 10` gives 3 real pages), or (b) growing the fixture past 50 rows so even
  the largest page-size option produces a second page. This proposal's recommendation, made at
  spec-revision time rather than as a separate team decision, is (a): fewer rows to hand-author for
  the same evaluation value. Flagged here as an implementer-facing recommendation, not a fixed
  mandate — record in task 2.11's findings if (b) turns out preferable during implementation.

  **Newly discovered requirement, not explicitly requested in the original amendment ask:**
  whichever option is chosen, the list loader — which today returns the fixture unsliced with a
  hardcoded `page: 1`/`pageSize: 50` regardless of the request's query string — must start reading
  `page`/`pageSize` from the request's search params and slicing the fixture rows accordingly
  (recomputing `totalItems`, `itemsOnThisPage`, and `page` per request). Verified against
  `Pagination`'s own `buildQueryString` (`app/frontend/pagination/view.tsx`): clicking "page 2"
  navigates to `?page=2&pageSize=10`, which the current loader ignores entirely, so the page would
  re-render identically. Without this, expanding the fixture to 25+ rows makes the pagination
  control clickable but still inert — task 2.7 covers this loader change explicitly for that
  reason; flag it to the human reviewer as scope the loader didn't need before this amendment.

- **Hazard classification options** (`hazardPickerData.ts`) — replaces `dataForHazardPicker`
  (`app/backend.server/models/hip_hazard_picker.ts`), which returns
  `HipDataForHazardPicker { types: Type[]; clusters: Cluster[]; hazards: Hazard[] }` where `Type`
  is `{ id, name }`, `Cluster` is `{ id, typeId, name }`, `Hazard` is `{ id, clusterId, name }`.
  The fixture must preserve the type→cluster→hazard parent-id linkage so the stubbed inline
  `ComboBox`/`Select` (Decision 3, `HazardPicker` row) can cascade-filter correctly.
- **Validator list** (`validatorUsers.ts`) — replaces the combined
  `getUserCountryAccountsWithValidatorRole` / `getUserCountryAccountsWithAdminRole` fallback
  behavior in `new.tsx` (`app/db/queries/userCountryAccountsRepository.ts`), each returning rows
  shaped `{ id, email, firstName, lastName, role, isPrimaryAdmin }` — verified during 1.5 that
  `organization` is not actually selected by this query (commented out in the real code); match the
  real shape, not this earlier assumption. One fixture list
  is sufficient (the POC does not need to reproduce the validator-then-admin-fallback branching —
  that branching is a data-sourcing detail, not something the rebuilt `SaveSubmitDialog` UI needs
  to exercise); note in a comment that production falls back to admins when no validators exist,
  and this fixture simply represents "the resulting list" already.
- **Division geojson** (`divisionGeoJson.ts`) — replaces the top-level-divisions-with-geojson query
  in `new.tsx` (selecting `id`, `name`, `geojson` from `divisionTable` filtered by
  `parentId IS NULL`, `geojson IS NOT NULL`, tenant `countryAccountsId`), consumed by
  `SpatialFootprintFormView`. A small number (2-4) of real-shaped division polygons is enough for
  the map widget to render something visually plausible; exact geographic accuracy doesn't matter
  for this spike.

**How fixtures are authored:** hand-authored realistic values matching the shapes above are
acceptable — this does **not** need to be a script pulling literal rows from a live database.
"Extracted/adapted from real data" means matching the real field names, types, and referential
structure (e.g. a cluster's `typeId` actually points at one of the fixture's own type `id`s), so the
rendered UI looks like a real hazardous event and the type→cluster→hazard cascade and validator
multi-select behave correctly — not that the values themselves were copy-pasted from production
rows. Task 1.5 (tasks.md) covers authoring these before any page is built against them.

## Risks / Trade-offs

- [PrimeReact's global theme CSS and `style-dts.css` both apply to the whole document, so visual
  "leakage" onto POC markup is possible even when nothing PrimeReact is imported] → mitigate by
  scoping the POC's Tailwind classes carefully and visually diffing early rather than only at the
  end; acceptable residual risk for a throwaway spike.
- [Stubbing `HazardPicker` with an inline `ComboBox` means the POC does not prove out the real
  popup-window/`postMessage` picker UX] → explicitly flagged as deferred; the real migration must
  separately design a picker approach that doesn't depend on a not-yet-migrated production route.
- [Mocking submit entirely (Decision 6, revised) means the POC never proves the accumulated stepper
  state is actually accepted by the real `hazardousEventCreate` input contract — only that it is
  shaped to match it, by manual inspection of the logged payload] → accepted trade-off, and the
  reason for it: reusing the real save path against mocked reference data (Decision 8) would have
  made saves fail unpredictably on foreign-key mismatches or, worse, silently write against the
  wrong real row if a mocked ID happened to collide with a real one — a fragile, environment-
  dependent proof point that would tell us more about this environment's data than about React
  Aria. Verifying the assembled payload's shape by manual inspection (tasks.md 3.11) is the
  accepted substitute.
- [Rebuilding `SaveSubmitDialog`'s validator multi-select in RAC is the single hardest UI piece in
  this spike] → if RAC's `ListBox`/`ComboBox` multi-select cannot cleanly reach visual parity in a
  reasonable time-box, that is itself a valid, reportable POC finding ("abandon" or
  "proceed-with-caveats"), not a blocker to finishing the spike.
- [`SaveSubmitDialog` and the attachments widget's real implementation (`ContentRepeater`) are both
  shared, multi-domain components (also used by disaster-event and disaster-record forms) — editing
  either in place would break isolation and affect production behavior outside this spike] →
  mitigated by Decision 3: `SaveSubmitDialog` is reimplemented as a brand-new POC-local file, never
  editing the original; `ContentRepeater`/`AttachmentsFormView` are reused unchanged rather than
  rebuilt. Verify during implementation that `git status`/`git diff` shows no changes under
  `app/frontend/components/approval-workflow/` or `app/components/ContentRepeater/`.
- [This spike, if left in the codebase indefinitely, risks bit-rotting or being mistaken for real
  functionality] → the isolation-by-omission approach (Decision 1) plus this being explicitly
  scoped as disposable makes cleanup (deleting `poc-react-aria+` route folders and the
  `react-aria-components` dependency) a single, easy follow-up regardless of outcome.

## Migration Plan

Not applicable in the deploy/rollback sense — this is additive-only (new dependency, new isolated
route files). "Rollback" is simply deleting the `poc-react-aria+` route folders and, if the
approach is abandoned, removing the `react-aria-components` dependency. No DB migration, no
existing-route changes, nothing to roll back in production behavior.

## Open Questions

- Does this Tailwind v4 setup style React Aria's `data-*` state attributes with plain arbitrary
  variants, or does it need `tailwindcss-react-aria-components`? (Decision 7 — verify first,
  before building components.)
  **Resolved (no longer open):** whether a stubbed/mocked submit action is an acceptable downgrade
  from reusing the real save path — resolved by explicit user decision; see Decision 6 (revised).
  Submit is fully mocked, not a time-boxed fallback.

**Resolved (no longer open):** whether the optional "authenticated list view" stretch item
(rebuilding `DataMainLinks`'s button and the actions column) should be attempted at all, or
whether the public-list-only path was sufficient signal — resolved by explicit user decision after
reviewing screenshots: it is no longer optional. The POC list page always renders the full
authenticated-equivalent column set (including Actions and "Showing X of Y") rather than treating
it as a stretch item; see Decision 3 (revised).

## Recommendation (task 4.3 — the actual deliverable of this spike)

**PROCEED** with React Aria Components + Tailwind as PrimeReact's replacement for the real
Hazardous Event Clean Architecture migration, with the caveats below tracked as follow-up planning
items rather than blockers.

### Why proceed

- **The single most important proof point succeeded with full parity, not "abandon."**
  `SaveSubmitDialog` — the most complex PrimeReact widget cluster in the app (`Dialog`, `Checkbox`,
  `MultiSelect`) — was fully reproduced with a genuine RAC `ComboBox` (`selectionMode="multiple"`),
  including the real validator-required-for-submit-for-validation rule (verified that `isDisabled`
  actually blocks `onPress`, not just a visual affordance). This was explicitly flagged in Decision
  3 as the finding that would matter most; it came back positive.
- **Tailwind v4 supports RAC's interaction states with zero extra dependency** — plain arbitrary
  `data-[hovered]:`/`data-[focus-visible]:` variants work out of the box (task 1.2); no need for
  `tailwindcss-react-aria-components`.
- **The list page reached near-total visual parity** against production's authenticated view —
  same columns, "Showing X of Y" text, working pagination, and a mocked Actions column with
  correctly-scoped per-row Edit visibility — after two rounds of live-review correction (container
  padding, DOM order, icon sizing). The corrections themselves are informative: matching legacy
  `dts-*` CSS by inspection alone was consistently less reliable than reading the actual CSS rule
  and measuring real bounding boxes — the real migration should budget for this kind of iterative,
  measured verification rather than assuming visual inspection catches everything.
- **The stepper restructuring, cascading hazard picker, per-step validation gating, and reused
  shared widgets (`SpatialFootprintFormView`, `AttachmentsFormView`) all integrated cleanly** into
  a React Aria–driven controlled-state model, including the native-validation trap Decision 4
  anticipated (a `required` field hidden on an inactive step blocking submission) — never
  materialized because the mount-only-active-step design prevented it by construction.

### Caveats to plan for in the real migration (not blockers)

1. **`HazardPicker`'s real UX (popup window + `postMessage`) was stubbed, not reproduced.** The
   real migration needs its own design decision for this — an inline combobox is a reasonable
   default given how this POC handled it, but that's a UX call for the team, not something this
   spike resolved for them.
2. **`DateField` only supports full `yyyy-mm-dd` precision.** Production's `date_optional_precision`
   type (partial `yyyy`/`yyyy-mm` entry) isn't reproduced by RAC's `DateField` out of the box —
   needs a custom solution (e.g. a segmented field with optional trailing segments) in the real
   migration.
3. **Shared multi-domain components (`SaveSubmitDialog.tsx`, `ContentRepeater`) need a migration
   ordering decision.** This POC deliberately built a POC-local one-off `SaveSubmitDialog` copy and
   left `ContentRepeater` untouched, specifically to preserve isolation — the real migration doesn't
   get that luxury. Since both are shared across Hazardous Event, disaster-event, and
   disaster-record, migrating one domain at a time means either duplicating the rebuilt component
   per-domain (as this POC did) or migrating the shared component once and updating every domain
   that imports it in the same change. Worth deciding before the real migration starts, not
   discovering mid-flight.
4. **Two unrelated pre-existing bugs were surfaced and should be filed separately** (not artifacts
   of this migration, found only because this spike exercised real code paths closely):
   - `ContentRepeater` gives its root `<div>` and its hidden `<textarea>` the same
     `id="attachments"` — a latent duplicate-id bug independent of any component-library choice.
   - A user with zero `user_country_accounts` rows hits an infinite login-redirect loop in
     production's real login flow (found while verifying the create route's auth boundary).
5. **Minor, low-cost cosmetic gaps** noted during the styling comparison: the native `<select>`
   chevron vs. RAC `Select`'s trigger glyph, and `hazardousEventStatus` rendered as a `RadioGroup`
   in the POC vs. a native `<select>` in production — both explicitly permitted deviations per
   Decision 3, not defects, but worth a design pass during the real migration for visual
   consistency across the app rather than per-field ad hoc choices.

### Downstream

This recommendation is the required input `_docs/refactoring-plan/design-system-unification-roadmap.md`
was waiting on (it currently assumes PrimeReact stays). Updating that roadmap around this
proceed-with-caveats outcome is explicitly out of scope for this change (per task 4.3) and should
be its own follow-up.
