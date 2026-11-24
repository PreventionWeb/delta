# design-system-components Spec Delta

## ADDED Requirements

### Requirement: DELTA Design System v0.7.2 React Aria UI primitives use semantic tokens only

Reusable v0.7.2 primitives under `app/design-system/ui/` SHALL use `react-aria-components`, Tailwind CSS v4, `lucide-react`, and semantic tokens from `_docs/design/tokens.css` only (no hex values, `--color-*` primitives, PrimeReact, or `app/domains/*` imports), leaving `app/design-system/components/` unchanged.

#### Scenario: Primitives pass static design-system compliance checks

- **WHEN** files under `app/design-system/ui/` are inspected by `yarn check:design-system`
- **THEN** zero hardcoded hex colors, zero `--color-*` primitive references, zero PrimeReact imports, and zero `app/domains/*` imports MUST be reported

#### Scenario: Transitional Phase 6a/6h components remain intact

- **WHEN** existing `app/design-system/components/` tests run
- **THEN** all existing `Table`, `Select`, `Combobox`, `Checkbox`, `DateRangePicker`, and `Link` tests MUST continue to pass unchanged

### Requirement: ModalDialog primitive enforces non-backdrop dismissal and focus trapping

The `ModalDialog` primitive under `app/design-system/ui/ModalDialog.tsx` SHALL use React Aria `ModalOverlay`, `Modal`, and `Dialog` with `isDismissable={false}` and `isKeyboardDismissDisabled={false}` so modals close only via Escape, the header close button, or explicit footer actions, and never via outside backdrop clicks.

#### Scenario: ModalDialog ignores backdrop click and closes on Escape

- **GIVEN** `ModalDialog` is rendered with `isOpen={true}`
- **WHEN** the user clicks the overlay scrim outside the dialog
- **THEN** `onOpenChange(false)` MUST NOT be called
- **AND** when the user presses `Escape`, `onOpenChange(false)` MUST be called

### Requirement: StatusIndicator primitive pairs a semantic dot with visible text

The `StatusIndicator` primitive under `app/design-system/ui/StatusIndicator.tsx` SHALL render an 8px circular indicator dot alongside visible sentence-case text so color is never the sole carrier of status meaning.

#### Scenario: StatusIndicator renders dot and text for positive and warning tones

- **WHEN** `StatusIndicator` is rendered with `tone="positive"` and `"Active"` (or `tone="warning"` and `"Invitation pending"`)
- **THEN** both the decorative status dot (`aria-hidden="true"`) and the visible text label MUST be rendered without pill fill or outline borders

### Requirement: SortableTable and Pagination primitives follow v0.7.2 table rules

The `SortableTable` primitive SHALL render a React Aria `Table` with sortable column header buttons displaying directional sort icons on the active column and subtle double-arrow icons on other sortable columns, while non-sortable columns (including visually hidden `Actions`) render no sort control. The `Pagination` primitive SHALL render the range summary on the left (`Showing X-Y of N <noun>`) and rows-per-page (`25`, `50`, `100`) plus previous/next icon buttons and `Page X of Y` on the right.

#### Scenario: Clicking a sortable column header emits sort descriptor changes

- **GIVEN** `SortableTable` is rendered with sortable columns and an `onSortChange` handler
- **WHEN** the user activates a sortable column header via click or keyboard Enter/Space
- **THEN** `onSortChange` MUST be invoked with the column id and toggled sort direction

#### Scenario: Pagination disables boundary navigation buttons

- **GIVEN** `Pagination` is rendered on page 1 of 3 with 64 total items and page size 25
- **THEN** it MUST display `"Showing 1-25 of 64 users"` and `"Page 1 of 3"`
- **AND** the Previous page button MUST be disabled while the Next page button MUST be enabled
