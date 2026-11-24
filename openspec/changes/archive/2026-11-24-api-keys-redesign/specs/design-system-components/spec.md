# Spec Delta

## ADDED Requirements

### Requirement: Callout primitive renders semantic-token status banners with accessible landmarks

The `Callout` primitive under `app/design-system/ui/Callout.tsx` SHALL render a semantic-token status banner supporting `tone` values `"success"`, `"error"`, `"info"`, and `"warning"`, an optional `title`, body `children`, and a decorative Lucide status icon (`aria-hidden="true"`), using `role="alert"` for `"error"` banners and `role="status"` for non-error banners without any hardcoded hex colors or `--color-*` primitive tokens.

#### Scenario: Success callout renders title, body, and status role

- **GIVEN** `Callout` is rendered with `tone="success"`, `title="National statistics sync is ready to use"`, and body text `"Copy the key and add it to the application that needs it."`
- **WHEN** the component mounts
- **THEN** it MUST render both the title and body text inside a semantic-token surface (`bg-good-bg`, `border-good-border`) with `role="status"`

#### Scenario: Error callout renders with alert role

- **GIVEN** `Callout` is rendered with `tone="error"` and an error message
- **WHEN** the component mounts
- **THEN** it MUST render with `role="alert"` and semantic critical tokens (`bg-crit-bg`, `border-crit-border`)

### Requirement: TextField primitive supports read-only, autofocus, and focus callbacks

The `TextField` primitive under `app/design-system/ui/TextField.tsx` SHALL support optional `isReadOnly`, `autoFocus`, and `onFocus` props so read-only copyable fields (such as newly created API keys) can render non-editable text that auto-selects on focus and modal forms can focus their initial field on open.

#### Scenario: Read-only TextField prevents editing and invokes onFocus

- **GIVEN** `TextField` is rendered with `isReadOnly={true}`, `value="dk_12345"`, and an `onFocus` handler
- **WHEN** the input receives focus
- **THEN** the underlying `<input>` MUST have the `readonly` attribute and MUST invoke `onFocus`

#### Scenario: Editable TextField without isReadOnly remains writable

- **GIVEN** `TextField` is rendered without `isReadOnly` and with an `onChange` handler
- **WHEN** the user types into the input
- **THEN** `onChange` MUST be invoked with the updated value
