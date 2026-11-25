# DELTA design rules

Design rules for anyone building DELTA UI, human or AI-assisted ("vibe coding"). Read this before writing UI code. The code standards are in [AGENTS.md](AGENTS.md); this file covers the visual and interaction side only.

Status: draft v0.7.3, written from `tokens.json` v0.7.3. Owner: the DELTA design lead (UNDRR, IDTS unit). No items are pending; the earlier proposals were agreed on 2026-11-09, the added components on 2026-11-10, WCAG 2.2 on 2026-11-11 and the table, pagination and tree list rules on 2026-11-12.

## Source of truth

- Values live in `tokens.json` (W3C DTCG format). `tokens.css` is generated from it. If this file and `tokens.json` disagree, `tokens.json` wins: flag it, do not pick one.
- Figma is the approved design repository: https://www.figma.com/design/Ob0UUgvpDBq8CqsmXpAsoG/-NEW--DELTA-Design-System-and-Screens (page "Elements & Patterns React Aria": Atoms, Components, Organisms, Examples). Figma variables carry the same names as the CSS custom properties.

## Stack

- React Aria Components for behaviour and accessibility, Tailwind CSS for styling.
- Icons: Lucide (`lucide-react`) only. 16px inline, 20px standalone. Icon-only buttons need an accessible label.
- Fonts: Inter (UI) and IBM Plex Mono (identifiers and codes only), both from Google Fonts. No other fonts.
- Charts: Recharts (MIT).
- Light theme only. No dark tokens have been agreed. Do not invent them.

## Tailwind setup (one-time, owner: ICT tech lead)

- `tokens.css` overrides Tailwind. For colour, spacing, corner radius, shadow, font size and font weight, only the values in `tokens.css` may exist in the Tailwind setup. Tailwind's own defaults for these are switched off.
- Anything `tokens.css` does not define (for example z-index) uses Tailwind's default until the design system defines it. Do not invent values.
- Status: not confirmed as done. The tech lead confirms here when the setup is complete.

## Principles

1. Guide the eye, don't fill the screen. If an element does not help users find what they need faster, leave it out.
2. Obvious over clever. Use the pattern users already know.
3. Trust comes from consistency. Behave the same way every time. No one-off exceptions.
4. Accessibility over aesthetics. WCAG 2.2 AA. When a visual choice conflicts, the accessible option wins.
5. Every decision needs a reason. Repeated decisions belong in the token system.

## Hard rules

- Use semantic tokens (`var(--fg)`, `var(--accent)`, ...) only. No hardcoded hex values, no primitives (`--color-*`) in components.
- Never invent a value. If a token or pattern is missing, see "When something is missing".
- No sidebar navigation. No fully rounded buttons (`radius-full` is for pills and avatars). No other icon libraries. No lorem ipsum.
- Spacing only from the scale (4, 8, 12, 16, 24, 32, 48, 64 px). No 20px, 40px or 80px steps.
- Every gap belongs to one container: use `gap` on the flex or grid parent. Never margin between siblings, never margin-bottom on a child combined with gap on the parent.
- Colour is never the only signal. Status always has text.
- Motion is pre-wired inside components. Do not set durations or easings, and do not animate in feature code. `prefers-reduced-motion` is handled at component level.
- Text in `--fg-3` is decorative or disabled only. It fails WCAG AA.
- No em-dashes in copy. Use hyphens. Sentence case for headings and labels.

## Accessibility

The standard is WCAG 2.2 AA (agreed 2026-11-11, replaces 2.1 AA). The contrast rules are under Colour. The rules below are the ones 2.1 and 2.2 add.

- **Target size**: every clickable area is at least 24 x 24px (`--target-min`). Icon buttons are 32px. A smaller visual, for example a 16px checkbox or the X on a tag, gets its size from padding or from its label.
- **Focus is never hidden**: a focused element is never fully covered by a sticky bar, a toast or a dialog.
- **Label in name**: if a control shows text, its accessible name contains that text. Do not give a button with visible text an `aria-label` that says something else.
- **Dragging**: anything that can be dragged also works with a click or tap. File upload always has a "Choose files" button.
- **Sign-in**: password and code fields allow paste and password managers, and use the right `autocomplete` value. No puzzles or memory tests.
- **No repeated entry**: do not ask again for information already given in the same flow. Confirming a new password is the exception.
- **Help**: help is in the same place on every page.
- **Check**: every new screen is checked with axe-core using the WCAG 2.0, 2.1 and 2.2 A and AA rules, plus a keyboard walk-through. The automatic check finds only part of the problems.

## Colour

Warm off-white page (`--bg` #FAF9F5) with white surfaces (`--surface`), warm-grey borders and text, slate-blue accent (`--accent` #2D6FA3).

| Token | Use |
|---|---|
| `--bg` | Page background. The top nav sits on it (no white bar) |
| `--surface` | Cards, panels, popovers, inputs |
| `--inset` | Row and list hover, current nav item, active filter trigger |
| `--border` / `--border-subtle` / `--border-strong` | Dividers and card outlines (cards and table rows use subtle) |
| `--control-border` | Inputs, selects, secondary buttons (3:1 minimum, WCAG 1.4.11). Hover: `--fg-2` |
| `--fg` / `--fg-2` | Primary and secondary text |
| `--accent`, `-hover`, `-active`, `-disabled`, `--accent-100` | Interactive elements, links, selected rows (`--accent-100`) |
| `--good`, `--warn`, `--crit`, `--info` (+ `-bg`, `-border`; `--crit-hover` for the destructive button) | Status only |
| `--focus-ring` | 2px solid, 2px offset, on `:focus-visible` |

Contrast ratios are recorded next to each value in `tokens.json`.

## Typography

| Role (`.t-*` class in `tokens.css`) | Size / weight | Use |
|---|---|---|
| page-title | 20 / 500 | Top-level screen heading (`h1`) |
| section-title | 16 / 500 | Card and panel heading, dialog header, mobile menu group titles (`h2`) |
| body | 14 / 400 | Default UI text |
| body-strong | 14 / 500 | Emphasis (`h3` when used as a heading) |
| label | 12 / 400 | KPI labels (form field labels use body) |
| column-header | 12 / 500 | Table column headers. Sentence case, `--fg-2`, never uppercase |
| caption | 11 / 400 | Metadata, timestamps |
| overline | 11 / 500, uppercase, 0.06em | Rare small labels only. Not for table headers |
| data | 14 / 400 IBM Plex Mono | Identifiers and codes only (IDs, record numbers) |
| data-large | 24 / 500 Inter, tabular-nums | KPI values |

Heading levels (`h1`-`h3`) follow the page structure, never skip a level, and take their look from the role above.

Numbers and dates in tables use body with `tabular-nums` (`.tnum`), right-aligned for numbers. Body is 14px. Line heights: tight 1.25, normal 1.5.

## Layout

- Max width 1280px, content centred, backgrounds bleed edge to edge. Not fluid.
- Mobile (375px+): 4 columns, 16px gutters and margins. Tablet (768px+): 8 columns, 24px. Desktop (1280px+): 12 columns, 24px gutters, 32px margins.
- Radius: sm 4 (chips), md 6 (buttons, inputs), lg 8 (cards, toasts), xl 12 (menus, dialogs), full (pills, avatars).
- Shadow: md for dropdowns and popovers, lg for dialogs.

## Components

Built on React Aria. Figma has every component below with its states. Components added on 2026-11-10 are listed under "Added components".

- **Button**: 32px high (28 compact, 40 large), 0 12px padding, radius-md, 14/400. Variants: primary, secondary, ghost, destructive. States: default, hover, active, disabled, loading (keeps width, spinner plus label, disabled while busy). Inter sits about 1px low in its line box: buttons and nav pills carry 2px extra bottom padding.
- **Input and field**: 32px (40 large), radius-md, border `--control-border`. Focus: accent border plus inset 1px ring, no offset ring. Label above in body, 6px gap. Help text 12px `--fg-2` below, 6px gap. Error 12px `--crit` below, plain language with an example. Disabled: `--inset` fill.
- **Select and filter trigger**: same as input. Filter triggers show the value only ("All hazards"); the field name is the `aria-label`. Non-default value: `--inset` fill, normal text colour.
- **Menu / popover**: surface, 1px `--border`, radius-xl, 8px padding, shadow-md, 4px from trigger. Items 32px, label only, hover `--inset`, selected = check icon right-aligned (no fill, no accent text). Max height 320px.
- **Status**: 8px dot plus body-role text, sentence case. No fill, no outline, no capitals. Neutral dot uses `--fg-3`. Display only.
- **Card**: surface, 1px `--border-subtle`, radius-lg, 16px padding.
- **Table**: rows 40px (32 compact), 0 16px cell padding, horizontal dividers only, selected `--accent-100`, sticky header. IDs in mono. React Aria Table.
  - Rows only show the hand cursor and the `--inset` hover fill when clicking the row does something (select, open). In a table where only the action buttons do something, rows have neither.
  - Sorting: click a column header to sort, click again to reverse. The sorted column shows an up or down arrow, other sortable columns a faint double arrow (12px icons). Sort only columns where the order means something, never the actions column. Sorting applies to the whole list, not only the current page.
  - Long text is cut off with an ellipsis and shown in full on hover. Action icon buttons stay visible, each with a tooltip.
- **Tabs**: pill style matching the nav triggers (32px, 12px horizontal padding, hover `--inset` at 55%, selected `--inset`).
- **Pagination**: range text left ("Showing 1-25 of 64 users"); on the right a "Rows per page" select with 25, 50 and 100, then previous and next icon buttons with "Page x of y". Default is 25 rows. Built from Select and Button.
- **Dialog**: 480px (640 large, full-screen on mobile), radius-xl, shadow-lg, scrim `--overlay`, 24px padding (8px under the header, 24px above the footer), section-title header with close button, footer actions right-aligned with 8px gap. Destructive actions use the destructive button and name the object.
- **Dialog use**: add, edit, view, delete and import open as dialogs on the list page, not as separate pages. Errors show under the field they belong to and clear when the field is edited. After saving, the dialog closes and a toast confirms it.
- **Dialog dismiss**: clicking outside a dialog does not close it, so nobody loses what they typed. A dialog closes only with its Cancel button, its close button or the Escape key. Applies to all dialogs.
- **Toast**: 320px, bottom right, `--toast-bg` with white text, icon in status colour (success uses `--good-on-dark` so it reads on the dark background; the other statuses are not agreed yet). Auto-dismiss 4s, critical stays until dismissed, stack up to 3.
- **Checkbox** 16px radius 4, **radio** 16px, **switch** 32x18, **date picker** (input with calendar button, popover calendar with 32px day cells, selected = accent fill).
- **Top nav**: 48px on the page colour, subtle bottom border. Left: DELTA wordmark plus instance selector (bordered select trigger). Right: Data, Analysis, About, Settings (quiet pill triggers, 32px, `--fg-2`; hover/open `--inset` at 55%; current `--inset`; no underline, no accent) plus avatar menu. Dropdown items are label only. Below 768px: hamburger, full-height menu, groups separated by 1px `--border` dividers, group titles section-title, items 14px `--fg-2`. React Aria MenuBar, MenuTrigger and Menu.

### Added components (agreed 2026-11-10)

Forms and feedback
- **Text area**: as input, minimum height 80px, 8px top padding, resizes vertically only.
- **Password field**: as input, with an eye / eye-off icon button on the right that shows or hides the value. The button needs an accessible label.
- **Input mask**: behaviour only, no visual spec. It formats what the user types (for example dates and codes) inside the standard input.
- **Tag**: 24px high, radius-sm, `--inset` fill, label role. Optional remove button (X, 16px). React Aria TagGroup.
- **Multi-select**: select trigger showing the count ("2 hazards selected"), popover as a menu with a check on each selected item.
- **File upload**: drop area with 1px dashed `--border-strong`, radius-lg, upload icon, text, secondary button "Choose files" and a caption-role format hint. States: default, drag over (`--accent` border, `--accent-100` fill), disabled (`--inset` fill, `--fg-3` text). React Aria DropZone and FileTrigger.
- **Message banner**: tones info, success, warning, error. Status `-bg` fill, 1px status `-border`, radius-lg, 16px icon top-aligned (Info, Check, Alert, X), body-strong title and body detail in `--fg-2`, padding 12px 16px, gap 12px. The error tone is the Error pattern (`role="alert"`).
- **Tooltip**: `--toast-bg` fill, `--fg-inverse` label text, padding 4px 8px, radius-md. Shows on hover and keyboard focus. React Aria Tooltip.

Navigation and lists
- **Breadcrumbs**: links in `--accent`, 16px chevron separators in `--fg-2`, current page in body-strong and not a link (`aria-current`).
- **Accordion**: header 48px high with a body-strong title and a chevron on the right (turns 180 degrees when open), 1px `--border-subtle` under each item, body text in `--fg-2` with 16px bottom padding. React Aria Disclosure.
- **Listbox**: surface, 1px `--control-border`, radius-md, 4px padding. Items are the same as menu items (32px, label only, check on selected).
- **Tree and tree select**: rows 32px, radius-md, 8px horizontal padding, 16px indent per level, 16px chevron per branch (right closed, down open), selected = `--accent-100` fill with accent text. Tree select is a select trigger with a tree in the popover (React Aria has no tree select, so it is composed).
- **Tree list**: a hierarchy shown as rows inside a card (sectors, geographic levels). Rows 40px with `--border-subtle` dividers, 24px indent per level, 24px chevron button per branch (right closed, down open). A column header row (column-header role) sits above; columns after the name have fixed widths so they line up across levels. A row with children opens and closes on click and shows the hand cursor and `--inset` hover fill. A row without children does nothing on click and has neither. Optional 32px action icon buttons at the row end. Search filters the tree and opens the matches; "Expand all" and "Collapse all" are ghost buttons. A count sits in the footer. React Aria Tree. Use the smaller Tree (32px rows) for picking inside forms and popovers.
- **List item** (replaces PrimeReact DataView): 56px row, 16px horizontal padding, body-strong title, caption detail line in `--fg-2`, chevron on the right, 1px `--border-subtle` divider, hover `--inset` at 55%. The list sits in a surface container with 1px `--border` and radius-lg.
- **Segmented button**: joined segments in one container (1px `--control-border`, radius-md), segments 32px high with 12px horizontal padding, selected `--inset`, hover `--inset` at 55%, disabled. For switching views of the same data (Table, Chart, Map). React Aria ToggleButtonGroup, single selection.
- **Stepper**: React Aria has none, so it is built by us. Marker 24px circle: complete = `--accent` fill with a check, current = surface fill with 2px `--accent` border and the number in accent, upcoming = surface fill with 1px `--control-border` and the number in `--fg-2`. Label body-strong when current, body otherwise. Connector 1px, 48px long, `--accent` after a completed step, `--border` otherwise.
- **Avatar**: 28px circle (32px large), `--inset` fill, initials in the label role.
- **Divider**: 1px `--border`, horizontal or vertical. React Aria Separator.

Menu structure (Settings is a desktop dropdown and a mobile menu group): Data (Hazardous events, Disaster events, Disaster impact). Analysis (Sectors, Hazards, Disaster events). About (About the system, Technical specifications, Partners, Methodologies, Support, FAQ). Settings (System settings, Access management, Organization management, Geographic levels, Sectors, API keys, Assets). Avatar menu (Profile, Change password, TOTP (2FA), then a divider and Sign out). Human effects is a sub-feature of Disaster impact, not a settings item.

## Patterns

- **Empty state**: card, 24px icon, section-title, one line of `--fg-2` text, one action. First use has a primary action; no results has a secondary action (clear filters).
- **Loading**: skeleton rows keep the layout (inset fill, 12px, 4px radius, pulse). Spinner 14px, 2px ring. Animations stop under reduced motion.
- **Error**: banner with `--crit-bg`, `--crit-border`, radius-lg, warning icon, bold message plus secondary detail, a "Try again" button, `role="alert"`. Keep the user's filters.
- **Forms**: see Input and field. Validate in plain language, say what to do.
- **Deleting**: the dialog names the object and says the delete cannot be undone. When the object cannot be deleted because it is in use, the dialog says so up front, says why and what to do, and has only a Close button.
- **Spelling**: UK English, with "organization" written with a z as in the current system and United Nations usage.
- **Charts** (Recharts): 2px linear lines (no smoothing), no dots, bars 14px with 4px rounded data end, horizontal gridlines only in `--border-subtle`, axis text 12px `--fg-2`, no animation. Every chart has `role="img"` with a text summary and a "Show as table" option. Categorical colours in fixed order #2D6FA3, #eb6834, #1baf7a, maximum three. Magnitude ramp: #cde2fb, #86b6ef, #3987e5, #256abf, #104281. Status colours only for status, always with a label.

## When something is missing

A feature branch never defines a new pattern. If a token or pattern is missing:
1. Document the gap in the PR.
2. Raise a design system issue.
3. The design system team adds it or explains how existing ones cover it.
4. Merge with a temporary workaround, or wait, then update when the token ships.

## Known gaps

- Dark mode: no tokens agreed.
- Map choropleth scale not defined.
- The lighter weights and pale borders still need testing on a standard-density monitor before final sign-off.
