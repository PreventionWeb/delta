# Spec Delta

## MODIFIED Requirements

### Requirement: DELTA Design System v0.7.2 React Aria UI primitives use semantic tokens only

Reusable v0.7.2 primitives under `app/design-system/components/` (exported from `app/design-system/components/index.ts`) SHALL use `react-aria-components`, Tailwind CSS v4, `lucide-react`, and semantic tokens from `_docs/design/tokens.css` only (no hex values, `--color-*` primitives, PrimeReact, or `app/domains/*` imports), coexisting alongside transitional Phase 6a/6h primitives such as `LegacyButton` until those legacy primitives are retired.

#### Scenario: Primitives pass static design-system compliance checks

- **WHEN** files under `app/design-system/components/` are inspected by `yarn check:design-system` and `tests/unit/design-system/components/imports.test.ts`
- **THEN** zero hardcoded hex colors, zero `--color-*` primitive references, zero PrimeReact imports, and zero `app/domains/*` imports MUST be reported

#### Scenario: Transitional Phase 6a/6h components remain intact

- **WHEN** existing `app/design-system/components/` tests run
- **THEN** all existing `LegacyButton`, `Table`, `Select`, `Combobox`, `Checkbox`, `DateRangePicker`, and `Link` tests MUST continue to pass unchanged

### Requirement: ModalDialog primitive enforces non-backdrop dismissal and focus trapping

The `ModalDialog` primitive under `app/design-system/components/ModalDialog.tsx` SHALL use React Aria `ModalOverlay`, `Modal`, and `Dialog` with `isDismissable={false}` and `isKeyboardDismissDisabled={false}` so modals close only via Escape, the header close button, or explicit footer actions, and never via outside backdrop clicks.

#### Scenario: ModalDialog ignores backdrop click and closes on Escape

- **GIVEN** `ModalDialog` is rendered with `isOpen={true}`
- **WHEN** the user clicks the overlay scrim outside the dialog
- **THEN** `onOpenChange(false)` MUST NOT be called
- **AND** when the user presses `Escape`, `onOpenChange(false)` MUST be called

### Requirement: StatusIndicator primitive pairs a semantic dot with visible text

The `StatusIndicator` primitive under `app/design-system/components/StatusIndicator.tsx` SHALL render an 8px circular indicator dot alongside visible sentence-case text so color is never the sole carrier of status meaning.

#### Scenario: StatusIndicator renders dot and text for positive and warning tones

- **WHEN** `StatusIndicator` is rendered with `tone="positive"` and `"Active"` (or `tone="warning"` and `"Invitation pending"`)
- **THEN** both the decorative status dot (`aria-hidden="true"`) and the visible text label MUST be rendered without pill fill or outline borders

### Requirement: Callout primitive renders semantic-token status banners with accessible landmarks

The `Callout` primitive under `app/design-system/components/Callout.tsx` SHALL render a semantic-token status banner supporting `tone` values `"success"`, `"error"`, `"info"`, and `"warning"`, an optional `title`, body `children`, and a decorative Lucide status icon (`aria-hidden="true"`), using `role="alert"` for `"error"` banners and `role="status"` for non-error banners without any hardcoded hex colors or `--color-*` primitive tokens.

#### Scenario: Success callout renders title, body, and status role

- **GIVEN** `Callout` is rendered with `tone="success"`, `title="National statistics sync is ready to use"`, and body text `"Copy the key and add it to the application that needs it."`
- **WHEN** the component mounts
- **THEN** it MUST render both the title and body text inside a semantic-token surface (`bg-good-bg`, `border-good-border`) with `role="status"`

#### Scenario: Error callout renders with alert role

- **GIVEN** `Callout` is rendered with `tone="error"` and an error message
- **WHEN** the component mounts
- **THEN** it MUST render with `role="alert"` and semantic critical tokens (`bg-crit-bg`, `border-crit-border`)

### Requirement: TextField primitive supports read-only, autofocus, and focus callbacks

The `TextField` primitive under `app/design-system/components/TextField.tsx` SHALL support optional `isReadOnly`, `autoFocus`, and `onFocus` props so read-only copyable fields (such as newly created API keys) can render non-editable text that auto-selects on focus and modal forms can focus their initial field on open.

#### Scenario: Read-only TextField prevents editing and invokes onFocus

- **GIVEN** `TextField` is rendered with `isReadOnly={true}`, `value="dk_12345"`, and an `onFocus` handler
- **WHEN** the input receives focus
- **THEN** the underlying `<input>` MUST have the `readonly` attribute and MUST invoke `onFocus`

#### Scenario: Editable TextField without isReadOnly remains writable

- **GIVEN** `TextField` is rendered without `isReadOnly` and with an `onChange` handler
- **WHEN** the user types into the input
- **THEN** `onChange` MUST be invoked with the updated value
