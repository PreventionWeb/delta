## ADDED Requirements

### Requirement: Button primitive renders visual variants matching legacy's button styling

The `Button` component SHALL render as a real, native-button-backed React Aria `Button`,
supporting a `primary` (filled) variant and an `outline` variant whose resting, hover, and
focus-visible appearance match legacy's `.mg-button-primary`/`.mg-button-outline` styling
(design.md Decision 12's token table), a `system` variant reusing legacy's
`mg-button mg-button-system` classes, a `system-primary` variant reusing
`mg-button mg-button-primary`, a chrome-less `icon` variant, and `accent`/
`accent-outline`/`muted-outline` variants for legacy's item-dialog buttons, and SHALL expose the
standard `disabled` DOM property when disabled.

#### Scenario: Primary variant renders as a filled button

- **WHEN** `Button` is rendered with `variant="primary"`
- **THEN** the rendered element is a `<button>` styled with a filled background, matching legacy's
  `.mg-button-primary`

#### Scenario: Outline variant renders as a bordered, unfilled button

- **WHEN** `Button` is rendered with `variant="outline"`
- **THEN** the rendered element is a `<button>` styled with a border and no filled background,
  matching legacy's `.mg-button-outline`

#### Scenario: System variant reuses legacy's mg-button-system classes

- **WHEN** `Button` is rendered with `variant="system"`
- **THEN** the rendered `<button>` carries legacy's own `mg-button mg-button-system` classes (the
  white, grey-bordered look of legacy `ContentRepeater`'s Add/Preview map buttons), not
  `dts-button`

#### Scenario: Accent variants reproduce legacy's item-dialog buttons in Tailwind classes

- **WHEN** `Button` is rendered with `variant="accent"`, `"accent-outline"`, or `"muted-outline"`
- **THEN** the rendered `<button>` is styled with Tailwind palette utility classes only (filled
  blue, blue outline, slate outline respectively), with no `dts-button`, `mg-button`, or
  PrimeReact class

#### Scenario: System-primary variant reuses legacy's mg-button-primary classes

- **WHEN** `Button` is rendered with `variant="system-primary"`
- **THEN** the rendered `<button>` carries legacy's own `mg-button mg-button-primary` classes

#### Scenario: Icon variant renders a bare button named by its aria-label

- **WHEN** `Button` is rendered with `variant="icon"`, an `aria-label`, and an icon child
- **THEN** the rendered `<button>` carries no `dts-button`/`mg-button` chrome and its accessible
  name is the `aria-label`

#### Scenario: A disabled Button cannot be activated

- **WHEN** `Button` is rendered with `disabled`
- **THEN** the rendered `<button>` element's `disabled` DOM property is `true`
- **AND** activating it (click or Enter/Space while focused) does not fire its `onPress` handler

### Requirement: Dialog primitive renders a modal with dismiss-on-escape and dismiss-on-outside-click, matching the PrimeReact Dialog it replaces

The `Dialog` component SHALL render a modal overlay (React Aria `ModalOverlay`/`Modal`/`Dialog`)
that traps focus while open, and SHALL be dismissible via the Escape key and via a click outside
the dialog panel — the same two dismiss triggers PrimeReact's `Dialog` already provided via its
own `onHide` callback (design.md Decision 12).

#### Scenario: Dialog renders its title and content while open

- **WHEN** `Dialog` is rendered with `isOpen` and a `title`/children
- **THEN** the title and the children content are both present in the rendered output

#### Scenario: Escape key closes the dialog

- **WHEN** `Dialog` is open and the Escape key is pressed while it has focus
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: Clicking outside the dialog panel closes the dialog

- **WHEN** `Dialog` is open and a click occurs outside the dialog panel (on the overlay)
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: A header close-icon button also closes the dialog

- **WHEN** `Dialog` is rendered with a `closeLabel` prop and the user activates the header's
  close-icon button
- **THEN** the dialog's open-state change callback fires with `false`
- **AND** the close-icon button's accessible name matches the supplied `closeLabel` (the label is
  caller-supplied, not translated inside `Dialog` itself — matching every other design-system
  component's own text-as-props convention)

### Requirement: Dialog supports a `variant="item"` for legacy's fixed-width item dialog

The `Dialog` component SHALL accept an optional `variant` prop (`"default"` | `"item"` |
`"fullscreen"`). Omitting
it MUST keep the existing chrome unchanged. `variant="item"` MUST render legacy ContentRepeater's
"Add new item" dialog look using Tailwind utility classes only (no PrimeReact components or theme
classes): a viewport-relative fixed width that narrows at smaller breakpoints, a bold title with a
round close-icon button, and a footer right-aligned below a divider (design.md Decision 14).

#### Scenario: Item variant keeps a fixed width regardless of content

- **WHEN** `Dialog` is rendered with `variant="item"`
- **THEN** its panel width comes from viewport-relative width classes, not from its content
- **AND** the close-icon button's accessible name is the supplied `closeLabel`

### Requirement: Dialog supports a `variant="fullscreen"` for legacy's whole-viewport Mapper

`variant="fullscreen"` MUST cover the whole viewport with a white panel, using legacy's own
`dts-dialog__header`, `dts-heading-2` and `dts-dialog-close-button` classes for its header, title
and close icon, and MUST let its content fill the remaining height (a shrinking flex column, so a
map inside can size to it).

#### Scenario: Fullscreen variant covers the viewport and closes via its close icon

- **WHEN** `Dialog` is rendered with `variant="fullscreen"`
- **THEN** its panel covers the viewport and its title uses `dts-heading-2`
- **AND** activating the close icon fires the open-state change callback with `false`

### Requirement: Dialog supports a `dismissDisabled` flag that suppresses only Escape-to-close

The `Dialog` component SHALL accept an optional `dismissDisabled` boolean. When `true`, pressing
Escape MUST NOT close the dialog, but clicking outside the dialog panel MUST still close it —
Escape-suppression only, not a full dismissal override. This lets a caller whose content owns a
competing Escape handler (e.g. a draw tool mid-draw) disable the conflict without losing
outside-click dismissal. Omitting the prop (every other caller) keeps today's behavior.

#### Scenario: dismissDisabled suppresses Escape but not outside-click dismissal

- **WHEN** `Dialog` is rendered with `dismissDisabled` and the user presses Escape
- **THEN** the dialog's open-state change callback is not called
- **WHEN** the user then clicks outside the dialog panel
- **THEN** the dialog's open-state change callback fires with `false`

#### Scenario: Omitting dismissDisabled keeps Escape-to-close working as before

- **WHEN** `Dialog` is rendered with no `dismissDisabled` prop and the user presses Escape
- **THEN** the dialog's open-state change callback fires with `false`

### Requirement: Section primitive renders a titled, grey-background card with an actions row below its content

The `Section` component SHALL render a `title`, `children`, and `actions` (e.g. one or more
`Button`s), inside a grey-background bordered card matching legacy's own `ContentRepeater` section
chrome (`.content-repeater`/`.content-repeater-caption`, design.md Decision 13) — without depending
on `ContentRepeater` or any of its per-item-list behavior. The `actions` slot renders **below**
`children`, in its own row — matching `.content-repeater-actions`' own position as a separate
block below the table, never beside the caption in the header row. `Section` SHALL have no
knowledge of what its `children`/`actions` represent; the caller decides the row-table/empty
content and which action buttons to show.

#### Scenario: Section renders its title, children, and actions, with actions after children

- **WHEN** `Section` is rendered with a `title`, `children`, and `actions`
- **THEN** the title text, the children content, and the actions element are all present in the
  rendered output
- **AND** the actions element renders after the children content, in a row below it, not beside
  the title in the header row

#### Scenario: Section's background and border match legacy's own section chrome

- **WHEN** `Section` is rendered
- **THEN** its container, caption, and actions row carry legacy's own `.content-repeater`,
  `.content-repeater-caption`, and `.content-repeater-actions` classes directly (design.md
  Decision 13), not a re-ported copy of their values

### Requirement: MultiSelectCombobox primitive supports filtering, multiple selection, and removable chips

The `MultiSelectCombobox` component SHALL filter its options by a case-insensitive substring match
as the user types, SHALL let the user select more than one option, and SHALL render each
currently-selected option as its own chip with a control to remove it — matching the PrimeReact
`MultiSelect` (`filter`, `display="chip"`) behavior it replaces (design.md Decision 12).

#### Scenario: Typing filters the option list case-insensitively

- **GIVEN** `MultiSelectCombobox` is rendered with options including one named `"Jane Doe"`
- **WHEN** the user types `"jane"` into the input
- **THEN** the displayed option list MUST include `"Jane Doe"`

#### Scenario: Selecting multiple options renders one chip per selection

- **WHEN** the user selects two different options
- **THEN** two chips are rendered, one per selected option, each showing that option's display
  text

#### Scenario: Removing a chip deselects that option

- **WHEN** the user activates a selected option's chip removal control
- **THEN** that option's chip is removed
- **AND** that option's id is no longer present in the component's selected-ids value
